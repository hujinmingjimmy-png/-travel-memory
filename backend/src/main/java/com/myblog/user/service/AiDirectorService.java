package com.myblog.user.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.myblog.user.exception.BusinessException;
import com.myblog.user.vo.RealMapPointVO;
import com.myblog.user.vo.TravelMediaVO;
import com.myblog.user.vo.TravelProjectVO;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Storyboard v1: real travel facts + fixed six-shot timeline. No database writes. */
@Service
public class AiDirectorService {
    private final TravelProjectService travels;
    private final TravelRealMapService realMap;
    private final TravelMediaService mediaService;
    private final ObjectMapper mapper;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5)).build();

    public AiDirectorService(TravelProjectService travels, TravelRealMapService realMap,
                             TravelMediaService mediaService, ObjectMapper mapper) {
        this.travels = travels;
        this.realMap = realMap;
        this.mediaService = mediaService;
        this.mapper = mapper;
    }

    public record Shot(int order, String type, int startMs, int durationMs, Long pointId,
                       Long mediaId, String caption, String motion) {}
    public record StoryboardDraft(String title, String style, String aspectRatio,
                                  int durationMs, String mode, String notice, List<Shot> shots) {}

    public StoryboardDraft generate(Long userId, Long travelId, boolean useAi) {
        if (travelId == null || travelId <= 0 || userId == null) {
            throw new BusinessException(400, "旅行参数无效");
        }
        // Do not allow visitors to send someone else's private travel context to an AI provider.
        TravelProjectVO travel = travels.getTravelDetail(userId, travelId);
        if (!userId.equals(travel.getUserId())) {
            throw new BusinessException(403, "只有旅行创建者可以制作 AI 影片");
        }
        List<RealMapPointVO> points = realMap.list(travelId, userId);
        List<TravelMediaVO> media = mediaService.list(userId, travelId);
        List<TravelMediaVO> images = media.stream()
                .filter(m -> m.getMimeType() != null && m.getMimeType().startsWith("image/"))
                .limit(60).toList();
        Set<Long> allowedMedia = new HashSet<>();
        for (TravelMediaVO m : images) allowedMedia.add(m.getId());
        int[] durations = {3000, 4000, 5000, 6000, 6000, 6000};
        String[] types = {"OPENING", "LOCATION", "PHOTO", "MEMORY", "MONTAGE", "CLOSING"};
        String[] motions = {"SLOW_ZOOM_IN", "STILL", "PAN_LEFT", "SLOW_ZOOM_IN", "CROSSFADE", "SLOW_ZOOM_OUT"};
        String[] captions = defaultCaptions(travel, points);
        String title = safe(travel.getTitle(), 80, "我的旅行电影");
        String mode = "RULES";
        String notice = "规则分镜：未请求外部 AI；如需 AI 文案，请勾选授权并配置服务端密钥。";

        if (useAi) {
            String key = System.getenv("OPENAI_API_KEY");
            if (key == null || key.isBlank()) {
                notice = "尚未配置 OPENAI_API_KEY，已生成规则分镜（不是 AI 结果）。";
            } else {
                try {
                    AiText text = getAiText(key, travel, points, images, captions);
                    title = text.title();
                    captions = text.captions();
                    mode = "AI_TEXT";
                    notice = "AI 已根据旅行文字和照片元数据生成文案；未向模型发送照片文件。";
                } catch (Exception ignored) {
                    // No secret, private content or upstream response should be echoed to clients.
                    notice = "AI 请求失败或结果不合规范，已回退到规则分镜。";
                    mode = "RULES_FALLBACK";
                }
            }
        }

        List<Shot> shots = new ArrayList<>();
        int start = 0;
        for (int i = 0; i < 6; i++) {
            RealMapPointVO point = points.isEmpty() ? null : points.get(Math.min(points.size() - 1, i * points.size() / 6));
            Long mediaId = null;
            if (point != null && point.getMediaId() != null && allowedMedia.contains(point.getMediaId())) {
                mediaId = point.getMediaId();
            } else if (!images.isEmpty()) {
                mediaId = images.get(i % images.size()).getId();
            }
            shots.add(new Shot(i + 1, types[i], start, durations[i],
                    point == null ? null : point.getId(), mediaId, captions[i], motions[i]));
            start += durations[i];
        }
        return new StoryboardDraft(title, "CINEMATIC", "16:9", 30000, mode, notice, shots);
    }

    private String[] defaultCaptions(TravelProjectVO travel, List<RealMapPointVO> points) {
        String title = safe(travel.getTitle(), 36, "这段旅行");
        String first = points.isEmpty() ? title : safe(points.get(0).getLocationName(), 25,
                safe(points.get(0).getTitle(), 25, title));
        String middle = points.isEmpty() ? "旅途里的风景" : safe(points.get(points.size() / 2).getTitle(), 30, "旅途里的风景");
        String last = points.isEmpty() ? title : safe(points.get(points.size() - 1).getTitle(), 30, title);
        return new String[] {"故事，从" + title + "开始", "从" + first + "出发", "走进" + middle,
                "把这一刻留在记忆里", "还有那些值得记住的风景", "旅行会结束，记忆不会。"};
    }

    private static String safe(String value, int max, String fallback) {
        if (value == null || value.isBlank()) return fallback;
        String text = value.trim().replaceAll("[\r\n\t]", " ");
        return text.substring(0, Math.min(text.length(), max));
    }

    private record AiText(String title, String[] captions) {}

    /** External AI receives only limited text metadata after the user's explicit opt-in. */
    private AiText getAiText(String key, TravelProjectVO travel, List<RealMapPointVO> points,
                             List<TravelMediaVO> images, String[] existing) throws Exception {
        List<Map<String, Object>> contextPoints = new ArrayList<>();
        for (RealMapPointVO p : points.stream().limit(12).toList()) {
            Map<String, Object> part = new LinkedHashMap<>();
            part.put("title", safe(p.getTitle(), 80, ""));
            part.put("locationName", safe(p.getLocationName(), 80, ""));
            part.put("story", safe(p.getContent(), 240, ""));
            contextPoints.add(part);
        }
        Map<String, Object> facts = new LinkedHashMap<>();
        facts.put("title", safe(travel.getTitle(), 80, "旅程"));
        facts.put("description", safe(travel.getDescription(), 350, ""));
        facts.put("points", contextPoints);
        facts.put("photoCaptions", images.stream().limit(12)
                .map(m -> safe(m.getCaption(), 80, "")) .toList());
        facts.put("existingCaptions", Arrays.asList(existing));

        Map<String, Object> schema = Map.of(
                "type", "object", "additionalProperties", false,
                "properties", Map.of(
                        "title", Map.of("type", "string"),
                        "captions", Map.of("type", "array", "items", Map.of("type", "string"))),
                "required", List.of("title", "captions"));
        String instructions = "你是私人旅行短片导演。只使用输入的旅行事实，不得虚构地点、人物、天气和具体经历。" +
                "写适合30秒16:9电影叙事的标题和恰好6条简短字幕，对应片头、地点、抵达、细节、高潮、尾声。" +
                "字幕每条最多35个汉字，尽量有叙事感，信息不足则保持抽象，不要编造。必须仅输出指定JSON。";
        Map<String, Object> payload = Map.of(
                "model", System.getenv().getOrDefault("AI_DIRECTOR_MODEL", "gpt-4.1-mini"),
                "instructions", instructions,
                "input", mapper.writeValueAsString(facts),
                "store", false,
                "max_output_tokens", 450,
                "text", Map.of("format", Map.of("type", "json_schema", "name", "travel_director_text",
                        "strict", true, "schema", schema)));
        HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.openai.com/v1/responses"))
                .timeout(Duration.ofSeconds(25))
                .header("Authorization", "Bearer " + key)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(payload)))
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) throw new IllegalStateException("AI upstream failed");
        JsonNode responseJson = mapper.readTree(response.body());
        JsonNode parsed = null;
        for (JsonNode item : responseJson.path("output")) {
            for (JsonNode piece : item.path("content")) {
                if ("output_text".equals(piece.path("type").asText())) {
                    parsed = mapper.readTree(piece.path("text").asText());
                    break;
                }
            }
            if (parsed != null) break;
        }
        if (parsed == null || !parsed.path("captions").isArray() || parsed.path("captions").size() != 6)
            throw new IllegalStateException("AI format invalid");
        String[] captions = new String[6];
        for (int i = 0; i < 6; i++) {
            String text = parsed.path("captions").get(i).asText("").trim();
            if (text.isEmpty() || text.length() > 70) throw new IllegalStateException("AI caption invalid");
            captions[i] = text;
        }
        String title = parsed.path("title").asText("").trim();
        if (title.isEmpty() || title.length() > 100) throw new IllegalStateException("AI title invalid");
        return new AiText(title, captions);
    }
}
