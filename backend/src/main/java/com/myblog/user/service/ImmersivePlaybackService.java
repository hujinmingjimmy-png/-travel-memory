package com.myblog.user.service;

import com.myblog.user.dto.ImmersiveSceneRequest;
import com.myblog.user.exception.BusinessException;
import com.myblog.user.vo.ImmersiveSceneVO;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Date;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class ImmersivePlaybackService {

    private static final double DEFAULT_SCALE = 1.12;
    private static final int DEFAULT_MOVE_DURATION = 900;
    private static final int DEFAULT_STAY_DURATION = 3800;
    private static final String DEFAULT_EASING = "ease-in-out";

    private static final Set<String> ALLOWED_EASING =
            Set.of("ease-in-out", "ease-out", "linear");

    private final JdbcTemplate jdbc;

    public ImmersivePlaybackService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<ImmersiveSceneVO> list(Long travelId, Long userId) {

        assertReadable(travelId, userId);

        String sql =
                "SELECT " +
                "s.id AS scene_id, " +
                "p.id AS point_id, " +
                "p.travel_id, " +
                "p.point_type, " +
                "p.media_id, " +
                "p.title, " +
                "p.subtitle, " +
                "p.content, " +
                "p.location_name, " +
                "p.travel_date, " +
                "COALESCE(s.sort_order, p.sort_order) AS final_sort_order, " +
                "COALESCE(s.camera_scale, ?) AS camera_scale, " +
                "COALESCE(s.move_duration, ?) AS move_duration, " +
                "COALESCE(s.stay_duration, ?) AS stay_duration, " +
                "COALESCE(s.easing, ?) AS easing, " +
                "p.x_ratio, " +
                "p.y_ratio, " +
                "p.longitude, " +
                "p.latitude " +
                "FROM travel_point p " +
                "LEFT JOIN travel_scene s " +
                "ON s.travel_id = p.travel_id " +
                "AND s.point_id = p.id " +
                "WHERE p.travel_id = ? " +
                "AND p.point_type IN ('CUSTOM','REAL') " +
                "ORDER BY " +
                "COALESCE(s.sort_order, p.sort_order), " +
                "p.travel_date IS NULL, " +
                "p.travel_date, " +
                "p.id " +
                "LIMIT 300";

        return jdbc.query(
                sql,
                (rs, rowNo) -> {
                    ImmersiveSceneVO item =
                            new ImmersiveSceneVO();

                    Object sceneId =
                            rs.getObject("scene_id");

                    item.setSceneId(
                            sceneId instanceof Number
                                    ? ((Number) sceneId)
                                    .longValue()
                                    : null
                    );

                    item.setPointId(
                            rs.getLong("point_id")
                    );

                    item.setTravelId(
                            rs.getLong("travel_id")
                    );

                    item.setPointType(
                            rs.getString("point_type")
                    );

                    Object mediaId =
                            rs.getObject("media_id");

                    item.setMediaId(
                            mediaId instanceof Number
                                    ? ((Number) mediaId)
                                    .longValue()
                                    : null
                    );

                    item.setTitle(
                            rs.getString("title")
                    );

                    item.setSubtitle(
                            rs.getString("subtitle")
                    );

                    item.setContent(
                            rs.getString("content")
                    );

                    item.setLocationName(
                            rs.getString("location_name")
                    );

                    Date day =
                            rs.getDate("travel_date");

                    item.setTravelDate(
                            day == null
                                    ? null
                                    : day.toLocalDate()
                    );

                    item.setSortOrder(
                            rs.getInt("final_sort_order")
                    );

                    item.setCameraScale(
                            rs.getDouble("camera_scale")
                    );

                    item.setMoveDuration(
                            rs.getInt("move_duration")
                    );

                    item.setStayDuration(
                            rs.getInt("stay_duration")
                    );

                    item.setEasing(
                            rs.getString("easing")
                    );

                    if (
                            "REAL".equals(
                                    item.getPointType()
                            )
                    ) {
                        item.setLongitude(
                                nullableDouble(
                                        rs.getObject("longitude")
                                )
                        );

                        item.setLatitude(
                                nullableDouble(
                                        rs.getObject("latitude")
                                )
                        );
                    } else {
                        item.setXRatio(
                                nullableDouble(
                                        rs.getObject("x_ratio")
                                )
                        );

                        item.setYRatio(
                                nullableDouble(
                                        rs.getObject("y_ratio")
                                )
                        );
                    }

                    return item;
                },
                DEFAULT_SCALE,
                DEFAULT_MOVE_DURATION,
                DEFAULT_STAY_DURATION,
                DEFAULT_EASING,
                travelId
        );
    }

    public ImmersiveSceneVO update(
            Long travelId,
            Long pointId,
            Long userId,
            ImmersiveSceneRequest request
    ) {

        assertOwner(travelId, userId);

        if (pointId == null || pointId <= 0) {
            throw new BusinessException("记忆点不存在");
        }

        if (request == null) {
            throw new BusinessException("播放参数不能为空");
        }

        List<Map<String, Object>> pointRows =
                jdbc.queryForList(
                        "SELECT id, sort_order " +
                        "FROM travel_point " +
                        "WHERE id = ? AND travel_id = ?",
                        pointId,
                        travelId
                );

        if (pointRows.isEmpty()) {
            throw new BusinessException(
                    404,
                    "记忆点不存在"
            );
        }

        int originalSort =
                ((Number) pointRows.get(0)
                        .get("sort_order"))
                        .intValue();

        int sortOrder =
                request.getSortOrder() == null
                        ? originalSort
                        : request.getSortOrder();

        double cameraScale =
                request.getCameraScale() == null
                        ? DEFAULT_SCALE
                        : request.getCameraScale();

        int moveDuration =
                request.getMoveDuration() == null
                        ? DEFAULT_MOVE_DURATION
                        : request.getMoveDuration();

        int stayDuration =
                request.getStayDuration() == null
                        ? DEFAULT_STAY_DURATION
                        : request.getStayDuration();

        String easing =
                request.getEasing() == null
                        ? DEFAULT_EASING
                        : request.getEasing().trim();

        validate(
                sortOrder,
                cameraScale,
                moveDuration,
                stayDuration,
                easing
        );

        jdbc.update(
                "INSERT INTO travel_scene (" +
                "travel_id, point_id, sort_order, " +
                "camera_scale, move_duration, stay_duration, easing" +
                ") VALUES (?, ?, ?, ?, ?, ?, ?) " +
                "ON DUPLICATE KEY UPDATE " +
                "sort_order = VALUES(sort_order), " +
                "camera_scale = VALUES(camera_scale), " +
                "move_duration = VALUES(move_duration), " +
                "stay_duration = VALUES(stay_duration), " +
                "easing = VALUES(easing)",
                travelId,
                pointId,
                sortOrder,
                cameraScale,
                moveDuration,
                stayDuration,
                easing
        );

        return list(
                travelId,
                userId
        )
        .stream()
        .filter(
                item ->
                        pointId.equals(
                                item.getPointId()
                        )
        )
        .findFirst()
        .orElseThrow(
                () ->
                        new BusinessException(
                                404,
                                "记忆点不存在"
                        )
        );
    }

    private void validate(
            int sortOrder,
            double cameraScale,
            int moveDuration,
            int stayDuration,
            String easing
    ) {

        if (
                sortOrder < -10000
                || sortOrder > 10000
        ) {
            throw new BusinessException(
                    "播放顺序超出允许范围"
            );
        }

        if (
                cameraScale < 1.0
                || cameraScale > 1.8
        ) {
            throw new BusinessException(
                    "照片放大倍率必须在 1.0 到 1.8 之间"
            );
        }

        if (
                moveDuration < 250
                || moveDuration > 10000
        ) {
            throw new BusinessException(
                    "镜头移动时间必须在 250 到 10000 毫秒之间"
            );
        }

        if (
                stayDuration < 800
                || stayDuration > 30000
        ) {
            throw new BusinessException(
                    "场景停留时间必须在 800 到 30000 毫秒之间"
            );
        }

        if (!ALLOWED_EASING.contains(easing)) {
            throw new BusinessException(
                    "不支持的转场缓动方式"
            );
        }
    }

    private Map<String, Object> project(
            Long travelId
    ) {

        if (
                travelId == null
                || travelId <= 0
        ) {
            throw new BusinessException(
                    404,
                    "旅行不存在"
            );
        }

        List<Map<String, Object>> rows =
                jdbc.queryForList(
                        "SELECT user_id, visibility, is_published " +
                        "FROM travel_project WHERE id = ?",
                        travelId
                );

        if (rows.isEmpty()) {
            throw new BusinessException(
                    404,
                    "旅行不存在"
            );
        }

        return rows.get(0);
    }

    private void assertReadable(
            Long travelId,
            Long userId
    ) {

        if (userId == null) {
            throw new BusinessException(
                    401,
                    "请先登录"
            );
        }

        Map<String, Object> project =
                project(travelId);

        boolean owner =
                isOwner(
                        project,
                        userId
                );

        Object published =
                project.get("is_published");

        boolean publicPublished =
                "PUBLIC".equals(
                        project.get("visibility")
                )
                && published instanceof Number
                && ((Number) published)
                .intValue() == 1;

        if (
                !owner
                && !publicPublished
        ) {
            throw new BusinessException(
                    404,
                    "旅行不存在或无权访问"
            );
        }
    }

    private void assertOwner(
            Long travelId,
            Long userId
    ) {

        if (userId == null) {
            throw new BusinessException(
                    401,
                    "请先登录"
            );
        }

        Map<String, Object> project =
                project(travelId);

        if (
                !isOwner(
                        project,
                        userId
                )
        ) {
            throw new BusinessException(
                    403,
                    "只有旅行创建者可以修改播放参数"
            );
        }
    }

    private boolean isOwner(
            Map<String, Object> project,
            Long userId
    ) {

        Object ownerId =
                project.get("user_id");

        return ownerId instanceof Number
                && userId.longValue()
                == ((Number) ownerId)
                .longValue();
    }

    private static Double nullableDouble(
            Object value
    ) {

        return value instanceof Number
                ? ((Number) value)
                .doubleValue()
                : null;
    }
}
