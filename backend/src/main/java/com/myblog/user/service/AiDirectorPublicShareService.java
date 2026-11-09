package com.myblog.user.service;

import com.myblog.user.exception.BusinessException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;

/** Publish a previously saved MP4 on an opt-in, revocable link. */
@Service
public class AiDirectorPublicShareService {
    public record Publication(String workId, boolean published, String shareToken) {}
    public record PublicFilm(String title, long fileBytes) {}
    public record PublicFile(Path file, String title) {}

    private final JdbcTemplate jdbc;
    private final AiDirectorWorkLibraryService library;
    private final Path root;
    private final SecureRandom random = new SecureRandom();

    public AiDirectorPublicShareService(JdbcTemplate jdbc,
                                        AiDirectorWorkLibraryService library,
                                        @Value("${travel.video.library-dir:./storage/video-works}") String libraryDir) {
        this.jdbc = jdbc;
        this.library = library;
        this.root = Path.of(libraryDir).toAbsolutePath().normalize();
    }

    private static boolean validId(String id) {
        return id != null && id.matches("(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");
    }

    private static boolean validToken(String token) {
        return token != null && token.matches("^[A-Za-z0-9_-]{43}$");
    }

    private String freshToken() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** The existing v6 download method checks the travel owner and saved file. */
    private void requireOwner(Long userId, Long travelId, String workId) {
        if (!validId(workId)) throw new BusinessException(400, "视频作品 ID 无效");
        library.download(userId, travelId, workId);
    }

    /** One query for all publications, not one request per work. */
    public List<Publication> list(Long userId, Long travelId) {
        library.list(userId, travelId); // owner authorization
        return jdbc.query("SELECT s.work_id, s.share_token, s.is_public " +
                        "FROM ai_director_video_share s INNER JOIN ai_director_video_work w ON w.id=s.work_id " +
                        "WHERE w.owner_user_id=? AND w.travel_id=? AND s.is_public=1",
                (rs, i) -> new Publication(rs.getString("work_id"), true, rs.getString("share_token")),
                userId, travelId);
    }

    public Publication publish(Long userId, Long travelId, String workId) {
        requireOwner(userId, travelId, workId);
        List<Publication> prior = jdbc.query(
                "SELECT work_id, is_public, share_token FROM ai_director_video_share WHERE work_id=?",
                (rs, i) -> new Publication(rs.getString("work_id"), rs.getBoolean("is_public"), rs.getString("share_token")),
                workId);
        if (!prior.isEmpty() && prior.get(0).published() && validToken(prior.get(0).shareToken())) {
            return prior.get(0); // repeat click does not change the link
        }
        for (int attempt = 0; attempt < 3; attempt++) {
            String token = freshToken();
            try {
                if (prior.isEmpty()) {
                    jdbc.update("INSERT INTO ai_director_video_share (work_id, share_token, is_public, published_at) " +
                            "VALUES (?,?,1,CURRENT_TIMESTAMP(3))", workId, token);
                } else {
                    jdbc.update("UPDATE ai_director_video_share SET share_token=?, is_public=1, published_at=CURRENT_TIMESTAMP(3) " +
                            "WHERE work_id=?", token, workId);
                }
                return new Publication(workId, true, token);
            } catch (DuplicateKeyException conflict) {
                // Unique token collision or another tab published concurrently.
                List<Publication> concurrent = jdbc.query(
                        "SELECT work_id, is_public, share_token FROM ai_director_video_share WHERE work_id=?",
                        (rs, i) -> new Publication(rs.getString("work_id"), rs.getBoolean("is_public"), rs.getString("share_token")),
                        workId);
                if (!concurrent.isEmpty() && concurrent.get(0).published()) return concurrent.get(0);
                prior = concurrent;
            }
        }
        throw new BusinessException(409, "分享链接生成冲突，请重试");
    }

    /** Clear the old token: republishing always creates a new URL. */
    public Publication revoke(Long userId, Long travelId, String workId) {
        requireOwner(userId, travelId, workId);
        jdbc.update("UPDATE ai_director_video_share SET share_token=NULL, is_public=0, published_at=NULL " +
                "WHERE work_id=?", workId);
        return new Publication(workId, false, null);
    }

    private record LocatedFilm(String title, long fileBytes, long ownerId, long travelId, String workId) {}

    private LocatedFilm locate(String token) {
        if (!validToken(token)) throw new BusinessException(404, "分享链接不存在或已经失效");
        List<LocatedFilm> matches = jdbc.query(
                "SELECT w.title, w.file_bytes, w.owner_user_id, w.travel_id, w.id " +
                "FROM ai_director_video_share s JOIN ai_director_video_work w ON w.id=s.work_id " +
                "WHERE s.share_token=? AND s.is_public=1 LIMIT 1",
                (rs, i) -> new LocatedFilm(rs.getString("title"), rs.getLong("file_bytes"),
                        rs.getLong("owner_user_id"), rs.getLong("travel_id"), rs.getString("id")), token);
        if (matches.isEmpty()) throw new BusinessException(404, "分享链接不存在或已经失效");
        return matches.get(0);
    }

    public PublicFilm publicFilm(String token) {
        LocatedFilm film = locate(token);
        return new PublicFilm(film.title(), film.fileBytes());
    }

    public PublicFile publicVideo(String token) {
        LocatedFilm film = locate(token);
        Path file = root.resolve(Long.toString(film.ownerId()))
                .resolve(Long.toString(film.travelId())).resolve(film.workId() + ".mp4").normalize();
        if (!file.startsWith(root) || !Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)) {
            throw new BusinessException(404, "公开的视频文件不存在");
        }
        return new PublicFile(file, film.title());
    }
}
