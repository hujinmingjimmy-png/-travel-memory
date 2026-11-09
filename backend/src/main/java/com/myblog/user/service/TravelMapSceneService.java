package com.myblog.user.service;

import com.myblog.user.dto.TravelMapSceneRequest;
import com.myblog.user.exception.BusinessException;
import com.myblog.user.vo.TravelMapSceneVO;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Set;

/** 保存“上传图片 / 真实地图卡通化”两种手账地图来源。 */
@Service
public class TravelMapSceneService {
    private final JdbcTemplate jdbc;
    private static final Set<String> SOURCES = Set.of("IMAGE", "CARTOON_REAL");
    private static final Set<String> STYLES = Set.of("SAKURA", "FRESH", "PAPER", "NIGHT");

    public TravelMapSceneService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    private Map<String, Object> readable(Long travelId, Long userId) {
        if (travelId == null || travelId <= 0 || userId == null) {
            throw new BusinessException(404, "旅行不存在");
        }
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT user_id, visibility, is_published FROM travel_project WHERE id = ?", travelId);
        if (rows.isEmpty()) throw new BusinessException(404, "旅行不存在");
        Map<String, Object> row = rows.get(0);
        Long ownerId = asLong(row.get("user_id"));
        boolean owner = userId.equals(ownerId);
        boolean publicPublished = "PUBLIC".equals(row.get("visibility"))
            && Integer.valueOf(1).equals(asInt(row.get("is_published")));
        if (!owner && !publicPublished) throw new BusinessException(404, "旅行不存在或无权访问");
        return row;
    }

    private void owner(Long travelId, Long userId) {
        Map<String, Object> row = readable(travelId, userId);
        if (!userId.equals(asLong(row.get("user_id")))) {
            throw new BusinessException(403, "只有创建者可以修改地图场景");
        }
    }

    public TravelMapSceneVO get(Long travelId, Long userId) {
        readable(travelId, userId);
        List<TravelMapSceneVO> rows = jdbc.query(
            "SELECT travel_id, source_type, center_lng, center_lat, zoom_level, pitch, rotation, " +
            "cartoon_style, south_west_lng, south_west_lat, north_east_lng, north_east_lat " +
            "FROM travel_map_scene WHERE travel_id = ?",
            (rs, n) -> {
                TravelMapSceneVO vo = new TravelMapSceneVO();
                vo.setTravelId(rs.getLong("travel_id"));
                vo.setSourceType(rs.getString("source_type"));
                vo.setCenterLng(nullableDouble(rs, "center_lng"));
                vo.setCenterLat(nullableDouble(rs, "center_lat"));
                vo.setZoom(nullableDouble(rs, "zoom_level"));
                vo.setPitch(nullableDouble(rs, "pitch"));
                vo.setRotation(nullableDouble(rs, "rotation"));
                vo.setCartoonStyle(rs.getString("cartoon_style"));
                vo.setSouthWestLng(nullableDouble(rs, "south_west_lng"));
                vo.setSouthWestLat(nullableDouble(rs, "south_west_lat"));
                vo.setNorthEastLng(nullableDouble(rs, "north_east_lng"));
                vo.setNorthEastLat(nullableDouble(rs, "north_east_lat"));
                return vo;
            }, travelId);
        return rows.isEmpty() ? defaults(travelId) : normalize(rows.get(0));
    }

    public TravelMapSceneVO save(Long travelId, Long userId, TravelMapSceneRequest r) {
        owner(travelId, userId);
        validate(r);
        String source = r.getSourceType().trim().toUpperCase();
        String style = r.getCartoonStyle() == null ? "SAKURA" : r.getCartoonStyle().trim().toUpperCase();

        jdbc.update(
            "INSERT INTO travel_map_scene " +
            "(travel_id, source_type, center_lng, center_lat, zoom_level, pitch, rotation, cartoon_style, " +
            "south_west_lng, south_west_lat, north_east_lng, north_east_lat) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
            "ON DUPLICATE KEY UPDATE source_type=VALUES(source_type), center_lng=VALUES(center_lng), " +
            "center_lat=VALUES(center_lat), zoom_level=VALUES(zoom_level), pitch=VALUES(pitch), " +
            "rotation=VALUES(rotation), cartoon_style=VALUES(cartoon_style), " +
            "south_west_lng=VALUES(south_west_lng), south_west_lat=VALUES(south_west_lat), " +
            "north_east_lng=VALUES(north_east_lng), north_east_lat=VALUES(north_east_lat), " +
            "updated_at=CURRENT_TIMESTAMP(3)",
            travelId, source, r.getCenterLng(), r.getCenterLat(), defaultNumber(r.getZoom(), 11.0),
            defaultNumber(r.getPitch(), 55.0), defaultNumber(r.getRotation(), 0.0), style,
            r.getSouthWestLng(), r.getSouthWestLat(), r.getNorthEastLng(), r.getNorthEastLat());
        return get(travelId, userId);
    }

    private void validate(TravelMapSceneRequest r) {
        if (r == null || r.getSourceType() == null || !SOURCES.contains(r.getSourceType().trim().toUpperCase())) {
            throw new BusinessException("地图来源只能是 IMAGE 或 CARTOON_REAL");
        }
        String style = r.getCartoonStyle() == null ? "SAKURA" : r.getCartoonStyle().trim().toUpperCase();
        if (!STYLES.contains(style)) throw new BusinessException("不支持的卡通地图风格");
        range(r.getCenterLng(), -180, 180, "地图中心经度");
        range(r.getCenterLat(), -90, 90, "地图中心纬度");
        range(defaultNumber(r.getZoom(), 11.0), 3, 20, "地图缩放级别");
        range(defaultNumber(r.getPitch(), 55.0), 0, 75, "地图倾斜角");
        range(defaultNumber(r.getRotation(), 0.0), -360, 360, "地图旋转角");
        range(r.getSouthWestLng(), -180, 180, "西南角经度");
        range(r.getSouthWestLat(), -90, 90, "西南角纬度");
        range(r.getNorthEastLng(), -180, 180, "东北角经度");
        range(r.getNorthEastLat(), -90, 90, "东北角纬度");
        if ("CARTOON_REAL".equals(r.getSourceType().trim().toUpperCase())
                && (r.getCenterLng() == null || r.getCenterLat() == null)) {
            throw new BusinessException("真实地图卡通模式必须先选择地图区域");
        }
    }

    private static void range(Double value, double min, double max, String name) {
        if (value != null && (!Double.isFinite(value) || value < min || value > max)) {
            throw new BusinessException(name + "不合法");
        }
    }

    private static Double defaultNumber(Double value, double fallback) {
        return value == null ? fallback : value;
    }

    private static TravelMapSceneVO defaults(Long travelId) {
        TravelMapSceneVO vo = new TravelMapSceneVO();
        vo.setTravelId(travelId);
        vo.setSourceType("IMAGE");
        vo.setCenterLng(114.3055);
        vo.setCenterLat(30.5928);
        vo.setZoom(11.0);
        vo.setPitch(55.0);
        vo.setRotation(0.0);
        vo.setCartoonStyle("SAKURA");
        return vo;
    }

    private static TravelMapSceneVO normalize(TravelMapSceneVO vo) {
        if (vo.getSourceType() == null) vo.setSourceType("IMAGE");
        if (vo.getZoom() == null) vo.setZoom(11.0);
        if (vo.getPitch() == null) vo.setPitch(55.0);
        if (vo.getRotation() == null) vo.setRotation(0.0);
        if (vo.getCartoonStyle() == null) vo.setCartoonStyle("SAKURA");
        return vo;
    }

    private static Double nullableDouble(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        double value = rs.getDouble(column);
        return rs.wasNull() ? null : value;
    }
    private static Long asLong(Object value) { return value instanceof Number ? ((Number) value).longValue() : null; }
    private static Integer asInt(Object value) { return value instanceof Number ? ((Number) value).intValue() : null; }
}
