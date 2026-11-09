package com.myblog.user.service;

import com.myblog.user.exception.BusinessException;
import com.myblog.user.vo.TravelProjectVO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/** Persistent, private library for user-approved Travel Memory MP4 exports. */
@Service
public class AiDirectorWorkLibraryService {
    private static final long MAX_MP4_BYTES = 200L * 1024 * 1024;
    private static final int MAX_WORKS_PER_TRAVEL = 50;

    private final JdbcTemplate jdbc;
    private final TravelProjectService travels;
    private final AiDirectorVideoService videos;
    private final Path libraryRoot;

    public record WorkInfo(String id, String title, long fileBytes, LocalDateTime createdAt) {}

    public AiDirectorWorkLibraryService(JdbcTemplate jdbc,
                                        TravelProjectService travels,
                                        AiDirectorVideoService videos,
                                        @Value("${travel.video.library-dir:./storage/video-works}") String libraryDir) {
        this.jdbc = jdbc;
        this.travels = travels;
        this.videos = videos;
        this.libraryRoot = Path.of(libraryDir).toAbsolutePath().normalize();
    }

    private void requireOwner(Long userId, Long travelId) {
        if (userId == null || userId <= 0 || travelId == null || travelId <= 0) {
            throw new BusinessException(400, "旅行参数无效");
        }
        TravelProjectVO travel = travels.getTravelDetail(userId, travelId);
        if (travel == null || !Objects.equals(travel.getUserId(), userId)) {
            throw new BusinessException(403, "只有旅行创建者可以管理视频作品");
        }
    }

    private WorkInfo mapWork(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        Timestamp created = rs.getTimestamp("created_at");
        return new WorkInfo(rs.getString("id"), rs.getString("title"),
                rs.getLong("file_bytes"), created.toLocalDateTime());
    }

    private List<WorkInfo> getByJob(Long userId, Long travelId, String jobId) {
        return jdbc.query("SELECT id, title, file_bytes, created_at FROM ai_director_video_work " +
                "WHERE owner_user_id=? AND travel_id=? AND source_job_id=? LIMIT 1",
                this::mapWork, userId, travelId, jobId);
    }

    public List<WorkInfo> list(Long userId, Long travelId) {
        requireOwner(userId, travelId);
        return jdbc.query("SELECT id, title, file_bytes, created_at FROM ai_director_video_work " +
                        "WHERE owner_user_id=? AND travel_id=? ORDER BY created_at DESC, id DESC LIMIT 50",
                this::mapWork, userId, travelId);
    }

    /** Saving is explicit; a 24h temporary job becomes an independent, durable file. */
    public WorkInfo save(Long userId, Long travelId, String jobId, String requestedTitle) {
        requireOwner(userId, travelId);
        if (jobId == null || !jobId.matches("[0-9a-fA-F-]{36}")) {
            throw new BusinessException(400, "视频任务 ID 无效");
        }
        List<WorkInfo> existing = getByJob(userId, travelId, jobId);
        if (!existing.isEmpty()) return existing.get(0);

        // Reuse v4/v5's authenticated, owner-scoped job lookup.
        Path rendered = videos.video(userId, travelId, jobId);
        String title = requestedTitle == null ? "旅行电影" : requestedTitle.trim();
        if (title.isBlank()) title = "旅行电影";
        if (title.length() > 100) throw new BusinessException(400, "影片标题不能超过 100 字");

        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM ai_director_video_work " +
                "WHERE owner_user_id=? AND travel_id=?", Long.class, userId, travelId);
        if (count != null && count >= MAX_WORKS_PER_TRAVEL) {
            throw new BusinessException(400, "该旅行最多保存 50 部视频，请先删除旧作品");
        }

        String id = UUID.randomUUID().toString();
        Path dir = libraryRoot.resolve(userId.toString()).resolve(travelId.toString()).normalize();
        Path target = dir.resolve(id + ".mp4").normalize();
        Path temp = dir.resolve(id + ".upload").normalize();
        if (!target.startsWith(libraryRoot) || !temp.startsWith(libraryRoot)) {
            throw new IllegalStateException("Invalid work storage path");
        }
        try {
            long bytes = Files.size(rendered);
            if (bytes < 10000 || bytes > MAX_MP4_BYTES) {
                throw new BusinessException(400, "MP4 文件大小不符合保存要求（最大 200MB）");
            }
            Files.createDirectories(dir);
            // Files.copy protects current temporary output from writes / moves.
            Files.copy(rendered, temp, StandardCopyOption.REPLACE_EXISTING);
            if (Files.size(temp) != bytes) throw new IOException("MP4 copy truncated");
            try {
                Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE);
            } catch (java.nio.file.AtomicMoveNotSupportedException ex) {
                Files.move(temp, target);
            }
            jdbc.update("INSERT INTO ai_director_video_work " +
                            "(id, owner_user_id, travel_id, source_job_id, title, file_bytes) VALUES (?,?,?,?,?,?)",
                    id, userId, travelId, jobId, title, bytes);
        } catch (DuplicateKeyException duplicate) {
            removeQuietly(target);
            removeQuietly(temp);
            List<WorkInfo> race = getByJob(userId, travelId, jobId);
            if (!race.isEmpty()) return race.get(0);
            throw duplicate;
        } catch (IOException ex) {
            removeQuietly(target);
            removeQuietly(temp);
            throw new IllegalStateException("保存视频文件失败，请检查服务器存储目录权限", ex);
        } catch (RuntimeException ex) {
            removeQuietly(target);
            removeQuietly(temp);
            throw ex;
        }
        return new WorkInfo(id, title, Files.exists(target) ? target.toFile().length() : 0,
                LocalDateTime.now());
    }

    private Path requireFile(Long userId, Long travelId, String workId) {
        if (workId == null || !workId.matches("[0-9a-fA-F-]{36}")) {
            throw new BusinessException(400, "作品 ID 无效");
        }
        List<String> ids = jdbc.query("SELECT id FROM ai_director_video_work " +
                "WHERE id=? AND owner_user_id=? AND travel_id=?",
                (rs, i) -> rs.getString("id"), workId, userId, travelId);
        if (ids.isEmpty()) throw new BusinessException(404, "作品不存在或无权访问");
        Path file = libraryRoot.resolve(userId.toString()).resolve(travelId.toString())
                .resolve(ids.get(0) + ".mp4").normalize();
        if (!file.startsWith(libraryRoot)) throw new BusinessException(400, "文件路径无效");
        return file;
    }

    public Path download(Long userId, Long travelId, String workId) {
        requireOwner(userId, travelId);
        Path file = requireFile(userId, travelId, workId);
        if (!Files.isRegularFile(file)) throw new BusinessException(404, "作品文件不存在，请检查服务器存储目录");
        return file;
    }

    public void delete(Long userId, Long travelId, String workId) {
        requireOwner(userId, travelId);
        Path file = requireFile(userId, travelId, workId);
        // Delete database metadata first; if file deletion fails the orphan is not exposed.
        int deleted = jdbc.update("DELETE FROM ai_director_video_work " +
                "WHERE id=? AND owner_user_id=? AND travel_id=?", workId, userId, travelId);
        if (deleted > 0) {
            try { Files.deleteIfExists(file); }
            catch (IOException ex) { // Orphan can be cleaned by the administrator.
                System.err.println("[AI Director v6] orphan MP4 after delete id=" + workId);
            }
        }
    }

    private static void removeQuietly(Path file) {
        try { Files.deleteIfExists(file); } catch (Exception ignored) { }
    }
}
