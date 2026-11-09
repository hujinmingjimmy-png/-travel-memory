package com.myblog.user.service;

import com.myblog.user.dto.RealMapPointRequest;
import com.myblog.user.exception.BusinessException;
import com.myblog.user.vo.RealMapPointVO;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;

import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;
import java.util.Map;

/**
 * 实景地图业务。借用 travel_point 的故事字段，但位置使用 longitude/latitude。
 * CUSTOM 与 REAL 分开查询，旧手账地图坐标不改变。
 */
@Service
public class TravelRealMapService {
    private final JdbcTemplate jdbc;
    private static final int MAX_REAL_POINTS = 120;
    public TravelRealMapService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    private Map<String, Object> readable(Long travelId, Long userId) {
        if (travelId == null || travelId <= 0 || userId == null) {
            throw new BusinessException(404, "旅行不存在");
        }
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT user_id, visibility, is_published FROM travel_project WHERE id = ?", travelId);
        if (rows.isEmpty()) throw new BusinessException(404, "旅行不存在");
        Map<String, Object> row = rows.get(0);
        boolean owner = userId.equals(asLong(row.get("user_id")));
        boolean publicPublished = "PUBLIC".equals(row.get("visibility"))
            && Integer.valueOf(1).equals(asInt(row.get("is_published")));
        if (!owner && !publicPublished) throw new BusinessException(404, "旅行不存在或无权访问");
        return row;
    }

    private void owner(Long travelId, Long userId) {
        Map<String, Object> row = readable(travelId, userId);
        if (!userId.equals(asLong(row.get("user_id")))) {
            throw new BusinessException(403, "只有旅行创建者可以编辑真实地图");
        }
    }

    private static Long asLong(Object obj) { return obj instanceof Number ? ((Number) obj).longValue() : null; }
    private static Integer asInt(Object obj) { return obj instanceof Number ? ((Number) obj).intValue() : null; }

    private void verifyMedia(Long travelId, Long mediaId) {
        if (mediaId == null) return;
        Integer matched = jdbc.queryForObject(
            "SELECT COUNT(*) FROM travel_media WHERE id = ? AND travel_id = ?",
            Integer.class, mediaId, travelId);
        if (matched == null || matched != 1) throw new BusinessException("只能选择这段旅行自己的照片");
    }

    private void validate(Long travelId, RealMapPointRequest r) {
        if (r == null || r.getTitle() == null || r.getTitle().trim().isEmpty()
                || r.getTitle().trim().length() > 80) {
            throw new BusinessException("记忆点标题不能为空，最多 80 个字符");
        }
        Double lng = r.getLongitude(), lat = r.getLatitude();
        if (lng == null || lat == null || !Double.isFinite(lng) || !Double.isFinite(lat)
                || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
            throw new BusinessException("经纬度不合法：经度 -180～180，纬度 -90～90");
        }
        if (r.getSubtitle() != null && r.getSubtitle().length() > 150) throw new BusinessException("副标题最多 150 字");
        if (r.getContent() != null && r.getContent().length() > 10000) throw new BusinessException("故事最多 10000 字");
        if (r.getLocationName() != null && r.getLocationName().length() > 120) throw new BusinessException("地点最多 120 字");
        if (r.getSortOrder() != null && (r.getSortOrder() < 0 || r.getSortOrder() > 100000))
            throw new BusinessException("排序号必须在 0～100000");
        verifyMedia(travelId, r.getMediaId());
    }

    private static String trim(String s, int max) {
        if (s == null || s.trim().isEmpty()) return null;
        s = s.trim(); return s.length() > max ? s.substring(0, max) : s;
    }

    private RealMapPointVO getPoint(Long travelId, Long pointId) {
        List<RealMapPointVO> rows = jdbc.query(
            "SELECT id, travel_id, media_id, title, subtitle, content, location_name, " +
            "travel_date, longitude, latitude, sort_order, created_at, updated_at " +
            "FROM travel_point WHERE travel_id = ? AND id = ? AND point_type = 'REAL'",
            (rs, n) -> {
                RealMapPointVO p = new RealMapPointVO();
                p.setId(rs.getLong("id"));
                p.setTravelId(rs.getLong("travel_id"));
                p.setMediaId(asLong(rs.getObject("media_id")));
                p.setTitle(rs.getString("title"));
                p.setSubtitle(rs.getString("subtitle"));
                p.setContent(rs.getString("content"));
                p.setLocationName(rs.getString("location_name"));
                Date day = rs.getDate("travel_date");
                p.setTravelDate(day == null ? null : day.toLocalDate());
                p.setLongitude(rs.getDouble("longitude"));
                p.setLatitude(rs.getDouble("latitude"));
                p.setSortOrder(rs.getInt("sort_order"));
                if (rs.getTimestamp("created_at") != null)
                    p.setCreatedAt(rs.getTimestamp("created_at").toLocalDateTime());
                if (rs.getTimestamp("updated_at") != null)
                    p.setUpdatedAt(rs.getTimestamp("updated_at").toLocalDateTime());
                return p;
            }, travelId, pointId);
        if (rows.isEmpty()) throw new BusinessException(404, "真实地图记忆点不存在");
        return rows.get(0);
    }

    public List<RealMapPointVO> list(Long travelId, Long userId) {
        readable(travelId, userId);
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT id FROM travel_point WHERE travel_id = ? AND point_type = 'REAL' " +
            "ORDER BY sort_order, id LIMIT 120", travelId);
        java.util.ArrayList<RealMapPointVO> list = new java.util.ArrayList<>();
        for (Map<String, Object> row : rows) list.add(getPoint(travelId, asLong(row.get("id"))));
        return list;
    }

    public RealMapPointVO create(Long travelId, Long userId, RealMapPointRequest request) {
        owner(travelId, userId);
        validate(travelId, request);
        Integer count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM travel_point WHERE travel_id = ? AND point_type = 'REAL'",
            Integer.class, travelId);
        if (count != null && count >= MAX_REAL_POINTS) throw new BusinessException("这段旅行最多 120 个真实地图记忆点");
        KeyHolder keyHolder = new GeneratedKeyHolder();
        int changed = jdbc.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(
                "INSERT INTO travel_point (travel_id, media_id, title, subtitle, content, " +
                "location_name, travel_date, longitude, latitude, sort_order, point_type) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REAL')",
                Statement.RETURN_GENERATED_KEYS);
            fill(ps, travelId, request);
            return ps;
        }, keyHolder);
        if (changed != 1 || keyHolder.getKey() == null) throw new BusinessException("记忆点创建失败");
        return getPoint(travelId, keyHolder.getKey().longValue());
    }

    private void fill(PreparedStatement ps, Long travelId, RealMapPointRequest r) throws java.sql.SQLException {
        ps.setLong(1, travelId);
        if (r.getMediaId() == null) ps.setNull(2, java.sql.Types.BIGINT);
        else ps.setLong(2, r.getMediaId());
        ps.setString(3, r.getTitle().trim());
        ps.setString(4, trim(r.getSubtitle(), 150));
        ps.setString(5, trim(r.getContent(), 10000));
        ps.setString(6, trim(r.getLocationName(), 120));
        if (r.getTravelDate() == null) ps.setNull(7, java.sql.Types.DATE);
        else ps.setDate(7, Date.valueOf(r.getTravelDate()));
        ps.setDouble(8, r.getLongitude());
        ps.setDouble(9, r.getLatitude());
        ps.setInt(10, r.getSortOrder() == null ? 0 : r.getSortOrder());
    }

    public RealMapPointVO update(Long travelId, Long pointId, Long userId, RealMapPointRequest request) {
        owner(travelId, userId);
        getPoint(travelId, pointId); // 阻止修改 CUSTOM 点，避免跨旅行访问
        validate(travelId, request);
        int changed = jdbc.update(
            "UPDATE travel_point SET media_id=?, title=?, subtitle=?, content=?, location_name=?, " +
            "travel_date=?, longitude=?, latitude=?, sort_order=?, updated_at = CURRENT_TIMESTAMP(3) " +
            "WHERE id=? AND travel_id=? AND point_type='REAL'",
            request.getMediaId(), request.getTitle().trim(), trim(request.getSubtitle(), 150),
            trim(request.getContent(), 10000), trim(request.getLocationName(), 120),
            request.getTravelDate() == null ? null : Date.valueOf(request.getTravelDate()),
            request.getLongitude(), request.getLatitude(),
            request.getSortOrder() == null ? 0 : request.getSortOrder(), pointId, travelId);
        if (changed != 1) throw new BusinessException("更新失败或内容没有变化");
        return getPoint(travelId, pointId);
    }


    /** Attach a confirmed GCJ-02 coordinate to an existing journal memory.
     * Does not insert a travel_point row or alter its CUSTOM type/story/media.
     */
    public void anchorCustom(Long travelId, Long pointId, Long userId, Double lng, Double lat) {
        owner(travelId, userId);
        if (lng == null || lat == null || !Double.isFinite(lng) || !Double.isFinite(lat)
                || lng < -180 || lng > 180 || lat < -90 || lat > 90)
            throw new BusinessException("真实地图坐标不合法");
        int changed=jdbc.update("UPDATE travel_point SET longitude=?,latitude=?,updated_at=CURRENT_TIMESTAMP(3) " +
                "WHERE id=? AND travel_id=? AND point_type='CUSTOM'",lng,lat,pointId,travelId);
        if(changed!=1) throw new BusinessException(404,"手账记忆点不存在或不属于当前旅行");
    }

    public void delete(Long travelId, Long pointId, Long userId) {
        owner(travelId, userId);
        int changed = jdbc.update(
            "DELETE FROM travel_point WHERE id = ? AND travel_id = ? AND point_type='REAL'",
            pointId, travelId);
        if (changed != 1) throw new BusinessException(404, "真实地图记忆点不存在");
    }
}
