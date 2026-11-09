package com.myblog.user.service;

import com.myblog.user.entity.User;
import com.myblog.user.exception.BusinessException;
import com.myblog.user.mapper.UserMapper;
import com.myblog.user.vo.DiscoverTravelVO;
import com.myblog.user.vo.FollowedAuthorVO;
import com.myblog.user.vo.PublicUserProfileVO;
import com.myblog.user.vo.UserProfileVO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.sql.Date;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

@Service
public class UserProfileService {

    private static final long MAX_AVATAR_SIZE = 3L * 1024 * 1024;

    private final UserMapper userMapper;
    private final JdbcTemplate jdbc;
    private final Path avatarRoot;

    public UserProfileService(
            UserMapper userMapper,
            JdbcTemplate jdbc,
            @Value("${profile.avatar-upload-dir:uploads/avatars}")
            String avatarUploadDir) {

        this.userMapper = userMapper;
        this.jdbc = jdbc;
        this.avatarRoot = Path.of(avatarUploadDir)
                .toAbsolutePath()
                .normalize();
    }

    public UserProfileVO me(Long userId) {
        return toProfile(requireActiveUser(userId));
    }

    @Transactional(rollbackFor = Exception.class)
    public UserProfileVO uploadAvatar(
            Long userId,
            MultipartFile file) {

        User user = requireActiveUser(userId);

        if (file == null
                || file.isEmpty()
                || file.getSize() <= 0
                || file.getSize() > MAX_AVATAR_SIZE) {
            throw new BusinessException("头像大小必须为 0～3MB（不含0）");
        }

        String mime = detectMimeType(file);
        String extension = extensionOf(mime);
        String oldAvatar = user.getAvatar();
        String safeName = UUID.randomUUID() + "." + extension;

        Path directory = avatarRoot
                .resolve(String.valueOf(userId))
                .normalize();

        Path destination = directory
                .resolve(safeName)
                .normalize();

        if (!directory.startsWith(avatarRoot)
                || !destination.startsWith(directory)) {
            throw new BusinessException("非法头像路径");
        }

        try {
            Files.createDirectories(directory);

            try (InputStream input = file.getInputStream()) {
                Files.copy(
                        input,
                        destination,
                        StandardCopyOption.REPLACE_EXISTING
                );
            }

            user.setAvatar(safeName);
            userMapper.updateById(user);

            scheduleDeleteAfterCommit(
                    managedAvatarPath(userId, oldAvatar)
            );

            return toProfile(user);

        } catch (IOException ex) {
            deleteQuietly(destination);
            throw new IllegalStateException(
                    "保存头像失败，请检查头像目录是否可写",
                    ex
            );
        } catch (RuntimeException ex) {
            deleteQuietly(destination);
            throw ex;
        }
    }

    @Transactional
    public UserProfileVO deleteAvatar(Long userId) {
        User user = requireActiveUser(userId);
        String oldAvatar = user.getAvatar();

        user.setAvatar(null);
        userMapper.updateById(user);

        scheduleDeleteAfterCommit(
                managedAvatarPath(userId, oldAvatar)
        );

        return toProfile(user);
    }

    public AvatarResource readAvatar(Long targetUserId) {
        User user = requireActiveUser(targetUserId);
        Path file = managedAvatarPath(targetUserId, user.getAvatar());

        if (file == null) {
            throw new BusinessException(404, "该用户没有上传头像");
        }

        try {
            if (!Files.isRegularFile(file)) {
                throw new BusinessException(404, "头像文件不存在");
            }

            String fileName = file.getFileName().toString();
            String mime = fileName.endsWith(".png")
                    ? "image/png"
                    : fileName.endsWith(".webp")
                    ? "image/webp"
                    : "image/jpeg";

            return new AvatarResource(
                    new FileSystemResource(file),
                    mime,
                    Files.size(file)
            );
        } catch (IOException ex) {
            throw new IllegalStateException("读取头像失败", ex);
        }
    }

    public List<FollowedAuthorVO> following(Long viewerId) {
        requireActiveUser(viewerId);

        String sql = """
                SELECT
                    u.id,
                    u.username,
                    COALESCE(NULLIF(u.nickname,''), u.username) AS display_name,
                    u.avatar,
                    (
                        SELECT COUNT(*)
                        FROM travel_project p
                        WHERE p.user_id = u.id
                          AND p.visibility = 'PUBLIC'
                          AND p.is_published = 1
                    ) AS public_travel_count,
                    (
                        SELECT COUNT(*)
                        FROM user_follow f2
                        WHERE f2.followed_id = u.id
                    ) AS follower_count
                FROM user_follow f
                INNER JOIN user u
                    ON u.id = f.followed_id
                WHERE f.follower_id = ?
                  AND u.status = 1
                ORDER BY f.created_at DESC, u.id DESC
                """;

        return jdbc.query(
                sql,
                (rs, rowNo) -> {
                    FollowedAuthorVO vo = new FollowedAuthorVO();
                    vo.setId(rs.getLong("id"));
                    vo.setUsername(rs.getString("username"));
                    vo.setDisplayName(rs.getString("display_name"));
                    vo.setAvatar(rs.getString("avatar"));
                    vo.setPublicTravelCount(rs.getLong("public_travel_count"));
                    vo.setFollowerCount(rs.getLong("follower_count"));
                    return vo;
                },
                viewerId
        );
    }

    public PublicUserProfileVO publicProfile(
            Long targetUserId,
            Long viewerId) {

        User target = requireActiveUser(targetUserId);
        requireActiveUser(viewerId);

        PublicUserProfileVO profile = new PublicUserProfileVO();
        profile.setId(target.getId());
        profile.setUsername(target.getUsername());
        profile.setDisplayName(
                target.getNickname() == null
                        || target.getNickname().trim().isEmpty()
                        ? target.getUsername()
                        : target.getNickname()
        );
        profile.setAvatar(target.getAvatar());
        profile.setFollowerCount(
                count(
                        "SELECT COUNT(*) FROM user_follow WHERE followed_id=?",
                        targetUserId
                )
        );
        profile.setPublicTravelCount(
                count(
                        "SELECT COUNT(*) FROM travel_project " +
                                "WHERE user_id=? AND visibility='PUBLIC' AND is_published=1",
                        targetUserId
                )
        );
        profile.setFollowing(
                !targetUserId.equals(viewerId)
                        && count(
                        "SELECT COUNT(*) FROM user_follow " +
                                "WHERE follower_id=? AND followed_id=?",
                        viewerId,
                        targetUserId
                ) > 0
        );
        profile.setTravels(publicTravels(targetUserId, viewerId));

        return profile;
    }

    private List<DiscoverTravelVO> publicTravels(
            Long authorId,
            Long viewerId) {

        String sql = """
                SELECT
                    p.id,
                    p.title,
                    p.subtitle,
                    p.description,
                    p.cover_url,
                    p.start_date,
                    p.end_date,
                    p.view_count,
                    p.like_count,
                    p.created_at,
                    p.user_id AS author_id,
                    u.avatar AS author_avatar,
                    COALESCE(NULLIF(u.nickname,''), u.username) AS author,
                    EXISTS(
                        SELECT 1
                        FROM travel_like viewer_like
                        WHERE viewer_like.travel_id = p.id
                          AND viewer_like.user_id = ?
                    ) AS liked,
                    EXISTS(
                        SELECT 1
                        FROM user_follow viewer_follow
                        WHERE viewer_follow.follower_id = ?
                          AND viewer_follow.followed_id = p.user_id
                    ) AS following,
                    COALESCE(
                        (
                            SELECT own_cover.id
                            FROM travel_media own_cover
                            WHERE own_cover.id = p.cover_media_id
                              AND own_cover.travel_id = p.id
                        ),
                        (
                            SELECT first_media.id
                            FROM travel_media first_media
                            WHERE first_media.travel_id = p.id
                            ORDER BY first_media.sort_order, first_media.id
                            LIMIT 1
                        )
                    ) AS cover_media_id
                FROM travel_project p
                INNER JOIN user u
                    ON u.id = p.user_id
                WHERE p.user_id = ?
                  AND p.visibility = 'PUBLIC'
                  AND p.is_published = 1
                  AND u.status = 1
                ORDER BY p.created_at DESC, p.id DESC
                LIMIT 60
                """;

        return jdbc.query(
                sql,
                (rs, rowNo) -> {
                    DiscoverTravelVO vo = new DiscoverTravelVO();
                    vo.setId(rs.getLong("id"));
                    vo.setTitle(rs.getString("title"));
                    vo.setSubtitle(rs.getString("subtitle"));
                    vo.setDescription(shorten(rs.getString("description"), 220));
                    vo.setAuthorId(rs.getLong("author_id"));
                    vo.setAuthor(rs.getString("author"));
                    vo.setAuthorAvatar(rs.getString("author_avatar"));
                    vo.setCoverUrl(rs.getString("cover_url"));

                    Object coverMediaId = rs.getObject("cover_media_id");
                    vo.setCoverMediaId(
                            coverMediaId instanceof Number
                                    ? ((Number) coverMediaId).longValue()
                                    : null
                    );

                    Date startDate = rs.getDate("start_date");
                    Date endDate = rs.getDate("end_date");
                    vo.setStartDate(startDate == null ? null : startDate.toLocalDate().toString());
                    vo.setEndDate(endDate == null ? null : endDate.toLocalDate().toString());
                    vo.setViewCount(rs.getLong("view_count"));
                    vo.setLikeCount(rs.getLong("like_count"));
                    vo.setLiked(rs.getBoolean("liked"));
                    vo.setFollowing(rs.getBoolean("following"));
                    vo.setCreatedAt(rs.getTimestamp("created_at").toLocalDateTime().toString());
                    return vo;
                },
                viewerId,
                viewerId,
                authorId
        );
    }

    private User requireActiveUser(Long userId) {
        if (userId == null || userId <= 0) {
            throw new BusinessException(401, "请先登录");
        }

        User user = userMapper.selectById(userId);

        if (user == null || !Integer.valueOf(1).equals(user.getStatus())) {
            throw new BusinessException(404, "用户不存在或已禁用");
        }

        return user;
    }

    private long count(String sql, Object... args) {
        Long value = jdbc.queryForObject(sql, Long.class, args);
        return value == null ? 0L : value;
    }

    private UserProfileVO toProfile(User user) {
        UserProfileVO vo = new UserProfileVO();
        vo.setId(user.getId());
        vo.setUsername(user.getUsername());
        vo.setNickname(user.getNickname());
        vo.setAvatar(user.getAvatar());
        return vo;
    }

    private void scheduleDeleteAfterCommit(Path file) {
        if (file == null) return;

        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            deleteQuietly(file);
            return;
        }

        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        deleteQuietly(file);
                    }
                }
        );
    }

    private void deleteQuietly(Path file) {
        try {
            Files.deleteIfExists(file);
        } catch (IOException ex) {
            org.slf4j.LoggerFactory
                    .getLogger(UserProfileService.class)
                    .warn("头像文件删除失败：{}", file.getFileName(), ex);
        }
    }

    private Path managedAvatarPath(Long userId, String avatar) {
        if (avatar == null
                || !avatar.matches("[0-9a-fA-F-]{36}\\.(jpg|png|webp)")) {
            return null;
        }

        Path directory = avatarRoot
                .resolve(String.valueOf(userId))
                .normalize();

        Path path = directory
                .resolve(avatar)
                .normalize();

        if (!directory.startsWith(avatarRoot)
                || !path.startsWith(directory)) {
            throw new BusinessException("非法头像路径");
        }

        return path;
    }

    private String detectMimeType(MultipartFile file) {
        byte[] header = new byte[12];

        try (InputStream input = file.getInputStream()) {
            int count = 0;

            while (count < header.length) {
                int read = input.read(header, count, header.length - count);
                if (read < 0) break;
                count += read;
            }

            if (count >= 3
                    && (header[0] & 0xFF) == 0xFF
                    && (header[1] & 0xFF) == 0xD8
                    && (header[2] & 0xFF) == 0xFF) {
                return "image/jpeg";
            }

            if (count >= 8
                    && Arrays.equals(
                    Arrays.copyOf(header, 8),
                    new byte[]{
                            (byte) 0x89,
                            0x50,
                            0x4E,
                            0x47,
                            0x0D,
                            0x0A,
                            0x1A,
                            0x0A
                    }
            )) {
                return "image/png";
            }

            if (count >= 12
                    && new String(header, 0, 4, StandardCharsets.US_ASCII).equals("RIFF")
                    && new String(header, 8, 4, StandardCharsets.US_ASCII).equals("WEBP")) {
                return "image/webp";
            }

        } catch (IOException ex) {
            throw new IllegalStateException("读取上传头像失败", ex);
        }

        throw new BusinessException("头像只支持 JPG、PNG、WEBP");
    }

    private String extensionOf(String mime) {
        return switch (mime) {
            case "image/jpeg" -> "jpg";
            case "image/png" -> "png";
            case "image/webp" -> "webp";
            default -> throw new BusinessException("不支持的头像格式");
        };
    }

    private static String shorten(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) return value;
        return value.substring(0, maxLength) + "…";
    }

    public record AvatarResource(
            FileSystemResource resource,
            String mimeType,
            long size) {
    }
}
