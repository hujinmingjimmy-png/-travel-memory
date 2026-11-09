package com.myblog.user.service;

import com.myblog.user.exception.BusinessException;
import com.myblog.user.vo.TravelProjectVO;
import com.myblog.user.vo.TravelMediaVO;
import com.myblog.user.vo.RealMapPointVO;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.InputStream;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * AI Director v4: authenticated 30s/16:9 H.264 MP4 export.
 * This first version creates photo/title cards on the server and animates them
 * using FFmpeg. No MySQL table, no public media URL, no arbitrary filter input.
 * Jobs are intentionally ephemeral and will disappear when the app restarts.
 */
@Service
public class AiDirectorVideoService {
    private static final int W = 1280, H = 720, FPS = 24;
    private static final int TOTAL_MS = 30000;
    private static final long RETENTION_MS = 24L * 60 * 60 * 1000;
    private final TravelProjectService travels;
    private final TravelRealMapService realMap;
    private final TravelMediaService media;
    private final AiDirectorTtsService tts;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "travel-ai-video-render");
        t.setDaemon(true);
        return t;
    });
    private final AtomicInteger waiting = new AtomicInteger(0);
    private final ConcurrentHashMap<String, Job> jobs = new ConcurrentHashMap<>();
    private final Path outputRoot = Path.of(System.getProperty("java.io.tmpdir"), "travel-memory-ai-v4");

    public AiDirectorVideoService(TravelProjectService travels, TravelRealMapService realMap,
                                  TravelMediaService media, AiDirectorTtsService tts) {
        this.travels = travels;
        this.realMap = realMap;
        this.media = media;
        this.tts = tts;
    }

    private static class Job {
        final String id;
        final Long owner, travel;
        final Instant created = Instant.now();
        volatile String status = "QUEUED", message = "已进入渲染队列";
        volatile int progress = 0;
        volatile Path video;
        Job(String id, Long owner, Long travel) { this.id = id; this.owner = owner; this.travel = travel; }
    }

    public record JobState(String jobId, String status, int progress, String message, boolean downloadable) {}
    private JobState view(Job job) { return new JobState(job.id, job.status, job.progress, job.message,
            "SUCCEEDED".equals(job.status) && job.video != null && Files.isRegularFile(job.video)); }

    private Job requireJob(Long userId, Long travelId, String jobId) {
        Job job = jobs.get(jobId);
        if (job == null || !Objects.equals(job.owner, userId) || !Objects.equals(job.travel, travelId)) {
            throw new BusinessException(404, "视频任务不存在或无权访问");
        }
        return job;
    }

    public JobState state(Long userId, Long travelId, String jobId) {
        return view(requireJob(userId, travelId, jobId));
    }

    public Path video(Long userId, Long travelId, String jobId) {
        Job job = requireJob(userId, travelId, jobId);
        if (!"SUCCEEDED".equals(job.status) || job.video == null || !Files.isRegularFile(job.video)) {
            throw new BusinessException(409, "视频尚未完成或文件已过期");
        }
        return job.video;
    }

    /** No draft-table dependency: browser-local storyboards can export too. */
    public JobState start(Long userId, Long travelId, AiDirectorService.StoryboardDraft draft) {
        return start(userId, travelId, draft, false, "coral");
    }

    public JobState start(Long userId, Long travelId, AiDirectorService.StoryboardDraft draft,
                          boolean voiceover, String voice) {
        validate(userId, travelId, draft);
        if (voiceover && !tts.configured()) {
            throw new BusinessException(400, "服务端尚未配置 OPENAI_API_KEY，无法生成 AI 旁白；可关闭配音后导出无声视频");
        }
        if (voiceover && !AiDirectorTtsService.supportedVoice(voice)) {
            throw new BusinessException(400, "不支持的 AI 旁白音色");
        }
        if (waiting.incrementAndGet() > 2) {
            waiting.decrementAndGet();
            throw new BusinessException(429, "当前视频渲染队列已满，请稍后重试");
        }
        try {
            Files.createDirectories(outputRoot);
            cleanupOldJobs();
            String id = UUID.randomUUID().toString();
            Job job = new Job(id, userId, travelId);
            jobs.put(id, job);
            executor.execute(() -> {
                try { render(job, draft, voiceover, voice); }
                catch (Exception e) {
                    job.status = "FAILED";
                    job.message = "导出失败，请检查后端 FFmpeg、AI 配音配置及服务端日志";
                    // Do not echo file system paths or user photo details to browser.
                    System.err.println("[AI Director v4] render failed job=" + job.id + " cause=" + e);
                } finally { waiting.decrementAndGet(); }
            });
            return view(job);
        } catch (Exception e) {
            waiting.decrementAndGet();
            throw new BusinessException(500, "创建视频任务失败");
        }
    }

    private void validate(Long userId, Long travelId, AiDirectorService.StoryboardDraft draft) {
        if (userId == null || userId <= 0 || travelId == null || travelId <= 0) {
            throw new BusinessException(400, "旅行参数无效");
        }
        TravelProjectVO trip = travels.getTravelDetail(userId, travelId);
        if (trip == null || !userId.equals(trip.getUserId())) {
            throw new BusinessException(403, "只有旅行创建者可以导出电影");
        }
        if (draft == null || draft.title() == null || draft.title().isBlank() || draft.title().length() > 100
                || draft.shots() == null || draft.shots().size() != 6 || draft.durationMs() != TOTAL_MS
                || !"16:9".equals(draft.aspectRatio()) || !"CINEMATIC".equals(draft.style())) {
            throw new BusinessException(400, "只允许导出 30 秒 16:9 六镜头分镜");
        }
        Set<Long> allowedMedia = new HashSet<>();
        for (TravelMediaVO m : media.list(userId, travelId)) {
            if (m.getId() != null && m.getMimeType() != null && m.getMimeType().startsWith("image/")) {
                allowedMedia.add(m.getId());
            }
        }
        Set<Long> allowedPoints = new HashSet<>();
        for (RealMapPointVO p : realMap.list(travelId, userId)) allowedPoints.add(p.getId());
        String[] types = {"OPENING", "LOCATION", "PHOTO", "MEMORY", "MONTAGE", "CLOSING"};
        Set<String> motions = Set.of("SLOW_ZOOM_IN", "SLOW_ZOOM_OUT", "PAN_LEFT", "PAN_RIGHT", "STILL", "CROSSFADE");
        int t = 0;
        for (int i = 0; i < 6; i++) {
            AiDirectorService.Shot s = draft.shots().get(i);
            if (s == null || s.order() != i + 1 || !types[i].equals(s.type())
                    || s.startMs() != t || s.durationMs() < 1500 || s.durationMs() > 10000
                    || s.durationMs() % 100 != 0 || !motions.contains(s.motion())
                    || s.caption() == null || s.caption().length() > 120
                    || (s.pointId() != null && !allowedPoints.contains(s.pointId()))
                    || (s.mediaId() != null && !allowedMedia.contains(s.mediaId()))) {
                throw new BusinessException(400, "分镜 " + (i + 1) + " 的时长或素材不合法");
            }
            t += s.durationMs();
        }
        if (t != TOTAL_MS) throw new BusinessException(400, "分镜总时长必须为 30 秒");
    }

    private void render(Job job, AiDirectorService.StoryboardDraft draft,
                        boolean voiceover, String voice) throws Exception {
        Path workDir = outputRoot.resolve(job.id);
        Files.createDirectories(workDir);
        job.status = "RUNNING";
        job.progress = 5;
        job.message = "正在准备旅行照片和字幕";
        List<Path> stills = new ArrayList<>();
        try {
            for (int i = 0; i < 6; i++) {
                Path still = workDir.resolve("shot" + i + ".jpg");
                makeCard(job.owner, job.travel, draft, i, still);
                stills.add(still);
                job.progress = 5 + (i + 1) * 5;
            }
            job.message = "正在合成 30 秒 MP4（720p）";
            Path result = workDir.resolve("film-30s.mp4");
            encode(stills, draft, result);
            if (!Files.isRegularFile(result) || Files.size(result) < 10000) {
                throw new IllegalStateException("FFmpeg output is empty");
            }
            if (voiceover) {
                job.progress = 70;
                job.message = "正在生成 AI 旁白并同步六个镜头";
                List<Narration> clips = new ArrayList<>();
                for (int i = 0; i < 6; i++) {
                    AiDirectorService.Shot shot = draft.shots().get(i);
                    if (shot.caption() == null || shot.caption().isBlank()) continue;
                    Path clip = workDir.resolve("voice" + i + ".mp3");
                    tts.generate(shot.caption(), voice, clip);
                    clips.add(new Narration(shot.startMs(), shot.durationMs(), clip));
                    job.progress = 70 + (i + 1) * 4;
                }
                if (clips.isEmpty()) throw new IllegalStateException("No narration text available");
                job.message = "正在合成有声 MP4";
                Path voiced = workDir.resolve("film-with-voice.mp4");
                mixNarration(result, clips, voiced);
                if (!Files.isRegularFile(voiced) || Files.size(voiced) < 10000) {
                    throw new IllegalStateException("Narrated output missing");
                }
                result = voiced;
            }
            job.video = result;
            job.progress = 100;
            job.status = "SUCCEEDED";
            job.message = "MP4 导出成功，可下载";
        } finally {
            for (Path still : stills) try { Files.deleteIfExists(still); } catch (Exception ignored) { }
        }
    }

    private void makeCard(Long user, Long travel, AiDirectorService.StoryboardDraft draft,
                          int index, Path dest) throws Exception {
        AiDirectorService.Shot shot = draft.shots().get(index);
        BufferedImage card = new BufferedImage(W, H, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = card.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
            g.setPaint(new GradientPaint(0, 0, new Color(40, 48, 72), W, H, new Color(90, 60, 75)));
            g.fillRect(0, 0, W, H);
            if (shot.mediaId() != null) {
                try {
                    TravelMediaService.MediaResource resource = media.read(user, travel, shot.mediaId());
                    if (resource.size() > 12 * 1024 * 1024) throw new IllegalArgumentException("Image too large");
                    BufferedImage photo;
                    try (InputStream in = resource.resource().getInputStream();
                         ImageInputStream stream = ImageIO.createImageInputStream(in)) {
                        if (stream == null) throw new IllegalArgumentException("Image stream unsupported");
                        Iterator<ImageReader> readers = ImageIO.getImageReaders(stream);
                        if (!readers.hasNext()) throw new IllegalArgumentException("Image format unsupported");
                        ImageReader reader = readers.next();
                        try {
                            reader.setInput(stream, true, true);
                            int w = reader.getWidth(0), h = reader.getHeight(0);
                            if (w < 1 || h < 1 || (long) w * h > 40_000_000L) throw new IllegalArgumentException("Image dimensions rejected");
                            photo = reader.read(0);
                        } finally { reader.dispose(); }
                    }
                    if (photo != null) {
                        double scale = Math.max(W / (double) photo.getWidth(), H / (double) photo.getHeight());
                        int pw = (int)Math.ceil(photo.getWidth() * scale);
                        int ph = (int)Math.ceil(photo.getHeight() * scale);
                        g.drawImage(photo, (W - pw) / 2, (H - ph) / 2, pw, ph, null);
                        photo.flush();
                    }
                } catch (Exception ignored) { /* Missing/unsupported media: keep the safe gradient. */ }
            }
            g.setPaint(new GradientPaint(0, 0, new Color(7, 12, 25, 60), 0, H,
                    new Color(7, 10, 20, 222)));
            g.fillRect(0, 0, W, H);
            g.setFont(new Font("Microsoft YaHei", Font.BOLD, 19));
            g.setColor(new Color(255, 230, 238));
            g.drawString("TRAVEL MEMORY   /   CINEMATIC", 72, 74);
            if (index == 0 || index == 5) {
                g.setFont(new Font("Microsoft YaHei", Font.BOLD, 48));
                drawCenteredLines(g, draft.title(), W / 2, 315, 1000, 62, 2);
            }
            g.setFont(new Font("Microsoft YaHei", Font.BOLD, 34));
            g.setColor(Color.WHITE);
            drawCenteredLines(g, shot.caption(), W / 2, 555, 1060, 48, 3);
            g.setFont(new Font("SansSerif", Font.PLAIN, 18));
            g.setColor(new Color(232, 230, 235));
            g.drawString(String.format(Locale.ROOT, "%02d / 06", index + 1), 72, 660);
        } finally { g.dispose(); }
        ImageIO.write(card, "jpg", dest.toFile());
        card.flush();
    }

    private static void drawCenteredLines(Graphics2D g, String raw, int centerX, int topY,
                                           int maxWidth, int lineHeight, int maxLines) {
        String text = raw.replaceAll("[\\p{Cntrl}]", " ").trim();
        FontMetrics fm = g.getFontMetrics();
        List<String> lines = new ArrayList<>();
        StringBuilder line = new StringBuilder();
        for (int offset = 0; offset < text.length();) {
            int cp = text.codePointAt(offset);
            String next = new String(Character.toChars(cp));
            if (fm.stringWidth(line + next) > maxWidth && line.length() > 0) {
                lines.add(line.toString());
                line.setLength(0);
                if (lines.size() == maxLines) break;
            }
            line.append(next);
            offset += Character.charCount(cp);
        }
        if (line.length() > 0 && lines.size() < maxLines) lines.add(line.toString());
        for (int i = 0; i < lines.size(); i++) {
            String part = lines.get(i);
            g.drawString(part, centerX - fm.stringWidth(part) / 2, topY + i * lineHeight);
        }
    }

    private void encode(List<Path> stills, AiDirectorService.StoryboardDraft draft, Path output) throws Exception {
        String exe = System.getenv().getOrDefault("TRAVEL_FFMPEG_PATH", "ffmpeg");
        List<String> args = new ArrayList<>();
        args.addAll(List.of(exe, "-hide_banner", "-loglevel", "error", "-y"));
        for (int i = 0; i < 6; i++) {
            // Extend first five input clips by 0.45s for 30-second xfade timeline.
            double duration = draft.shots().get(i).durationMs() / 1000.0 + (i == 5 ? 0 : 0.45);
            args.addAll(List.of("-loop", "1", "-framerate", String.valueOf(FPS), "-t",
                    String.format(Locale.ROOT, "%.2f", duration), "-i", stills.get(i).toString()));
        }
        StringBuilder graph = new StringBuilder();
        int elapsed = 0;
        for (int i = 0; i < 6; i++) {
            AiDirectorService.Shot s = draft.shots().get(i);
            int frames = (int)Math.round((s.durationMs() / 1000.0 + (i < 5 ? 0.45 : 0)) * FPS);
            String zoom = switch (s.motion()) {
                case "SLOW_ZOOM_OUT" -> "max(1.10-on*0.00014,1.01)";
                case "PAN_LEFT", "PAN_RIGHT" -> "1.12";
                case "STILL" -> "1.01";
                default -> "min(1.01+on*0.00014,1.10)";
            };
            String x = switch (s.motion()) {
                case "PAN_LEFT" -> "(iw-iw/zoom)*(1-on/" + frames + ")";
                case "PAN_RIGHT" -> "(iw-iw/zoom)*on/" + frames;
                default -> "iw/2-(iw/zoom/2)";
            };
            graph.append("[").append(i).append(":v]scale=1280:720,")
                .append("zoompan=z='").append(zoom).append("':x='").append(x)
                .append("':y='ih/2-(ih/zoom/2)':d=1:s=1280x720:fps=24,")
                .append("trim=duration=")
                .append(String.format(Locale.ROOT, "%.2f", s.durationMs()/1000.0+(i < 5 ? 0.45 : 0)))
                .append(",setpts=PTS-STARTPTS,fps=24,settb=AVTB,format=yuv420p[v").append(i).append("]; ");
        }
        for (int i = 1; i < 6; i++) {
            elapsed += draft.shots().get(i - 1).durationMs();
            graph.append(i == 1 ? "[v0]" : "[x" + (i-1) + "]")
                    .append("[v").append(i).append("]xfade=transition=fade:duration=0.45:offset=")
                    .append(String.format(Locale.ROOT, "%.2f", elapsed / 1000.0))
                    .append("[z").append(i).append("]; [z").append(i)
                    .append("]fps=24,settb=AVTB[x").append(i).append("]; ");
        }
        // Pad a potential fractional-frame shortfall; always encode exactly 30.0 seconds.
        graph.append("[x5]tpad=stop_mode=clone:stop_duration=1,trim=duration=30,")
             .append("setpts=PTS-STARTPTS[out]");
        String filter = graph.toString().trim();
        args.addAll(List.of("-filter_complex", filter, "-map", "[out]", "-an", "-c:v", "libx264",
                "-preset", "veryfast", "-crf", "25", "-pix_fmt", "yuv420p",
                "-r", "24", "-t", "30", "-movflags", "+faststart", output.toString()));
        Process process = new ProcessBuilder(args).redirectErrorStream(true).start();
        boolean finished = process.waitFor(300, TimeUnit.SECONDS);
        if (!finished) { process.destroyForcibly(); throw new IllegalStateException("FFmpeg timed out"); }
        String details;
        try (InputStream stdout = process.getInputStream()) {
            details = new String(stdout.readNBytes(4000), java.nio.charset.StandardCharsets.UTF_8);
        }
        if (process.exitValue() != 0) throw new IllegalStateException("FFmpeg exit " + process.exitValue() + " " + details);
    }

    private record Narration(int startMs, int durationMs, Path audio) {}

    /** Mix AI speech at the exact start of each subtitle shot; keep exactly 30s. */
    private void mixNarration(Path silentVideo, List<Narration> clips, Path output) throws Exception {
        String exe = System.getenv().getOrDefault("TRAVEL_FFMPEG_PATH", "ffmpeg");
        List<String> args = new ArrayList<>(List.of(
                exe, "-hide_banner", "-loglevel", "error", "-y", "-i", silentVideo.toString(),
                "-f", "lavfi", "-t", "30", "-i", "anullsrc=r=48000:cl=stereo"));
        for (Narration clip : clips) args.addAll(List.of("-i", clip.audio().toString()));
        StringBuilder graph = new StringBuilder();
        graph.append("[1:a]atrim=duration=30,asetpts=PTS-STARTPTS[a0];");
        for (int i = 0; i < clips.size(); i++) {
            Narration clip = clips.get(i);
            double allowed = Math.max(0.4, clip.durationMs() / 1000.0 - 0.12);
            double fade = Math.min(0.18, allowed / 4.0);
            graph.append("[").append(i + 2).append(":a]aresample=48000,atrim=duration=")
                 .append(String.format(Locale.ROOT, "%.3f", allowed))
                 .append(",asetpts=PTS-STARTPTS,afade=t=out:st=")
                 .append(String.format(Locale.ROOT, "%.3f", allowed - fade))
                 .append(":d=").append(String.format(Locale.ROOT, "%.3f", fade))
                 .append(",adelay=").append(clip.startMs()).append("|").append(clip.startMs())
                 .append("[a").append(i + 1).append("];");
        }
        graph.append("[a0]");
        for (int i = 0; i < clips.size(); i++) graph.append("[a").append(i + 1).append("]");
        graph.append("amix=inputs=").append(clips.size() + 1)
             .append(":duration=first:dropout_transition=0,atrim=duration=30,asetpts=PTS-STARTPTS[outa]");
        args.addAll(List.of("-filter_complex", graph.toString(), "-map", "0:v:0", "-map", "[outa]",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-t", "30",
                "-movflags", "+faststart", output.toString()));
        Process process = new ProcessBuilder(args).redirectErrorStream(true).start();
        // FFmpeg errors are small with loglevel=error, but drain while running to avoid pipe deadlock.
        java.util.concurrent.CompletableFuture<String> diagnostics =
                java.util.concurrent.CompletableFuture.supplyAsync(() -> {
                    try (InputStream stream = process.getInputStream()) {
                        return new String(stream.readNBytes(5000), java.nio.charset.StandardCharsets.UTF_8);
                    } catch (Exception ignored) { return ""; }
                });
        if (!process.waitFor(120, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new IllegalStateException("Narration mux timed out");
        }
        String details = diagnostics.get(3, TimeUnit.SECONDS);
        if (process.exitValue() != 0) {
            throw new IllegalStateException("Narration mux exit " + process.exitValue() + " " + details);
        }
    }

    private void cleanupOldJobs() {
        Instant cutoff = Instant.now().minusMillis(RETENTION_MS);
        jobs.entrySet().removeIf(e -> e.getValue().created.isBefore(cutoff));
        try (DirectoryStream<Path> directories = Files.newDirectoryStream(outputRoot)) {
            for (Path dir : directories) {
                if (!Files.isDirectory(dir)) continue;
                if (Files.getLastModifiedTime(dir).toInstant().isAfter(cutoff)) continue;
                try (var files = Files.list(dir)) { files.forEach(p -> { try { Files.deleteIfExists(p); } catch (Exception ignored) {} }); }
                Files.deleteIfExists(dir);
            }
        } catch (Exception ignored) { /* best effort cleanup */ }
    }

    @PreDestroy public void shutdown() { executor.shutdownNow(); }
}
