package com.myblog.user.service;

import com.myblog.user.exception.BusinessException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;

/**
 * v8 Discover is a SECOND, explicit opt-in beyond v7's share-by-link.
 * A listing is valid only while the exact v7 share token is still active.
 * Thus revoking and republishing in v7 NEVER silently restores a listing.
 */
@Service
public class AiDirectorFilmDiscoveryService {
    public record FilmCard(String shareToken, String title, long fileBytes, LocalDateTime listedAt) {}
    public record FilmPage(List<FilmCard> items, int page, int size, boolean hasMore) {}
    public record ListingState(String workId, boolean listed) {}

    private final JdbcTemplate jdbc;
    private final AiDirectorWorkLibraryService library;
    private final Path root;

    public AiDirectorFilmDiscoveryService(
            JdbcTemplate jdbc,
            AiDirectorWorkLibraryService library,
            @Value("${travel.video.library-dir:./storage/video-works}") String rootDir) {
        this.jdbc = jdbc;
        this.library = library;
        this.root = Path.of(rootDir).toAbsolutePath().normalize();
    }

    private void requireOwned(Long userId, Long travelId, String workId) {
        // v6 checks real travel ownership and saved MP4 existence.
        library.download(userId, travelId, workId);
    }

    /** Only the owner can see which of their films are in Discover. */
    public List<String> ownedListings(Long userId, Long travelId) {
        library.list(userId, travelId);
        return jdbc.query(
                "SELECT d.work_id FROM ai_director_video_discover d " +
                "JOIN ai_director_video_share s ON s.work_id=d.work_id " +
                "JOIN ai_director_video_work w ON w.id=d.work_id " +
                "WHERE w.owner_user_id=? AND w.travel_id=? AND s.is_public=1 " +
                "AND s.share_token=d.share_token ORDER BY d.listed_at DESC",
                (rs, row) -> rs.getString("work_id"), userId, travelId);
    }

    /** Requires an existing, active public share; this does NOT publish a private film. */
    public ListingState listInDiscover(Long userId, Long travelId, String workId) {
        requireOwned(userId, travelId, workId);
        List<String> tokens = jdbc.query(
                "SELECT share_token FROM ai_director_video_share WHERE work_id=? " +
                "AND is_public=1 AND share_token IS NOT NULL",
                (rs, row) -> rs.getString("share_token"), workId);
        if (tokens.isEmpty()) {
            throw new BusinessException(400, "请先主动公开分享视频，再选择展示到发现页");
        }
        String token = tokens.get(0);
        if (token == null || !token.matches("[A-Za-z0-9_-]{43}")) {
            throw new BusinessException(400, "分享链接无效，请重新发布视频");
        }
        jdbc.update("INSERT INTO ai_director_video_discover (work_id, share_token, listed_at) " +
                        "VALUES (?,?,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE " +
                        "share_token=VALUES(share_token), listed_at=CURRENT_TIMESTAMP(3)",
                workId, token);
        return new ListingState(workId, true);
    }

    public ListingState removeFromDiscover(Long userId, Long travelId, String workId) {
        requireOwned(userId, travelId, workId);
        jdbc.update("DELETE FROM ai_director_video_discover WHERE work_id=?", workId);
        return new ListingState(workId, false);
    }

    private record Candidate(String workId, String token, String title, long bytes,
                             long ownerId, long travelId, LocalDateTime listedAt) {}

    public FilmPage discover(int requestedPage, int requestedSize, String rawQuery) {
        int page = Math.min(500, Math.max(1, requestedPage));
        int size = Math.min(12, Math.max(1, requestedSize));
        String query = rawQuery == null ? "" : rawQuery.trim();
        if (query.length() > 50) throw new BusinessException(400, "搜索关键字不能超过 50 字");

        // Escape SQL LIKE wildcard characters. Parameters always use JDBC binding.
        String like = "%" + query.replace("!", "!!")
                .replace("%", "!%")
                .replace("_", "!_") + "%";
        String base = "SELECT d.work_id, d.share_token, w.title, w.file_bytes, " +
                "w.owner_user_id, w.travel_id, d.listed_at " +
                "FROM ai_director_video_discover d " +
                "JOIN ai_director_video_share s ON s.work_id=d.work_id " +
                "AND s.is_public=1 AND s.share_token=d.share_token " +
                "JOIN ai_director_video_work w ON w.id=d.work_id " +
                "WHERE d.share_token IS NOT NULL ";
        boolean search = !query.isEmpty();
        String sql = base + (search ? "AND w.title LIKE ? ESCAPE '!' " : "") +
                "ORDER BY d.listed_at DESC, d.work_id DESC LIMIT ? OFFSET ?";
        int offset = (page - 1) * size;
        var rowMapper = (org.springframework.jdbc.core.RowMapper<Candidate>) (rs, i) -> {
            Timestamp t = rs.getTimestamp("listed_at");
            return new Candidate(rs.getString("work_id"), rs.getString("share_token"),
                    rs.getString("title"), rs.getLong("file_bytes"), rs.getLong("owner_user_id"),
                    rs.getLong("travel_id"), t == null ? null : t.toLocalDateTime());
        };
        List<Candidate> rows = search
                ? jdbc.query(sql, rowMapper, like, size + 1, offset)
                : jdbc.query(sql, rowMapper, size + 1, offset);
        boolean hasMore = rows.size() > size;
        var items = rows.stream().limit(size).filter(c -> {
            // A missing file is never promoted to a playable Discover listing.
            Path file = root.resolve(Long.toString(c.ownerId()))
                    .resolve(Long.toString(c.travelId()))
                    .resolve(c.workId() + ".mp4").normalize();
            return file.startsWith(root) && Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS);
        }).map(c -> new FilmCard(c.token(), c.title(), c.bytes(), c.listedAt())).toList();
        return new FilmPage(items, page, size, hasMore);
    }
}
