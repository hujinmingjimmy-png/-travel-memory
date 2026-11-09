package com.myblog.user.service;

import com.myblog.user.dto.TravelMapBackgroundRequest;
import com.myblog.user.dto.TravelPointRequest;
import com.myblog.user.exception.BusinessException;
import com.myblog.user.vo.TravelMapVO;
import com.myblog.user.vo.TravelPointVO;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Date;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 空间记忆地图业务。
 * 采用 JdbcTemplate 不需要改 TravelProject、TravelMedia 实体和已有 Mapper。
 */
@Service
public class TravelMapService {
    private final JdbcTemplate jdbc;

    public TravelMapService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    private static final int MAX_POINTS = 120;

    // 当前请求是否能访问旅行：拥有者可读所有状态，访客仅可读公开且已发布内容。
    private Map<String, Object> requireReadable(Long travelId, Long userId) {
        if (travelId == null || travelId <= 0 || userId == null) {
            throw new BusinessException(404, "旅行不存在");
        }
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT user_id, visibility, is_published, map_background_media_id " +
            "FROM travel_project WHERE id = ?", travelId);
        if (rows.isEmpty()) throw new BusinessException(404, "旅行不存在");
        Map<String, Object> row = rows.get(0);
        boolean owner = userId.equals(longValue(row.get("user_id")));
        boolean publiclyAvailable = "PUBLIC".equals(row.get("visibility")) &&
            Integer.valueOf(1).equals(intValue(row.get("is_published")));
        if (!owner && !publiclyAvailable) {
            // 不暴露私密/草稿旅行是否存在。
            throw new BusinessException(404, "旅行不存在或无权访问");
        }
        return row;
    }

    private void requireOwner(Long travelId, Long userId) {
        Map<String, Object> row = requireReadable(travelId, userId);
        if (!userId.equals(longValue(row.get("user_id")))) {
            throw new BusinessException(403, "只有创建者可以编辑地图");
        }
    }

    // 别人的旅行照片不能偷偷关联到自己的地图里。
    private void checkPhoto(Long travelId, Long mediaId) {
        if (mediaId == null) return;
        Integer count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM travel_media WHERE id = ? AND travel_id = ?",
            Integer.class, mediaId, travelId);
        if (count == null || count != 1) {
            throw new BusinessException("必须从当前旅行已经上传的照片中选择");
        }
    }

    public TravelMapVO getMap(Long travelId, Long userId) {
        Map<String, Object> project = requireReadable(travelId, userId);
        TravelMapVO vo = new TravelMapVO();
        vo.setTravelId(travelId);
        Long backgroundMediaId = longValue(project.get("map_background_media_id"));
        // 如果选定的背景照片后来被删除，前端应退回默认地图，而不是暴露坏引用。
        if (backgroundMediaId != null) {
            Integer matches = jdbc.queryForObject(
                "SELECT COUNT(*) FROM travel_media WHERE id = ? AND travel_id = ?",
                Integer.class, backgroundMediaId, travelId);
            if (matches == null || matches != 1) backgroundMediaId = null;
        }
        vo.setMapBackgroundMediaId(backgroundMediaId);
        vo.setPoints(jdbc.query(
            "SELECT id, travel_id, media_id, title, subtitle, content, location_name, travel_date, " +
            "x_ratio, y_ratio, sort_order, created_at, updated_at " +
            "FROM travel_point WHERE travel_id = ? ORDER BY sort_order, id",
            (rs, number) -> {
                TravelPointVO p = new TravelPointVO();
                p.setId(rs.getLong("id"));
                p.setTravelId(rs.getLong("travel_id"));
                p.setMediaId(longValue(rs.getObject("media_id")));
                p.setTitle(rs.getString("title"));
                p.setSubtitle(rs.getString("subtitle"));
                p.setContent(rs.getString("content"));
                p.setLocationName(rs.getString("location_name"));
                Date day = rs.getDate("travel_date");
                p.setTravelDate(day == null ? null : day.toLocalDate());
                p.setXRatio(rs.getDouble("x_ratio"));
                p.setYRatio(rs.getDouble("y_ratio"));
                p.setSortOrder(rs.getInt("sort_order"));
                if (rs.getTimestamp("created_at") != null) {
                    p.setCreatedAt(rs.getTimestamp("created_at").toLocalDateTime());
                }
                if (rs.getTimestamp("updated_at") != null) {
                    p.setUpdatedAt(rs.getTimestamp("updated_at").toLocalDateTime());
                }
                return p;
            }, travelId));
        return vo;
    }

    public void setBackground(Long travelId, Long userId, TravelMapBackgroundRequest request) {
        requireOwner(travelId, userId);
        if (request == null) throw new BusinessException("请求不能为空");
        checkPhoto(travelId, request.getMediaId());
        jdbc.update("UPDATE travel_project SET map_background_media_id = ?, " +
            "updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND user_id = ?",
            request.getMediaId(), travelId, userId);
    }

    public TravelPointVO createPoint(Long travelId, Long userId, TravelPointRequest request) {
        requireOwner(travelId, userId);
        validate(travelId, request);
        Integer count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM travel_point WHERE travel_id = ?", Integer.class, travelId);
        if (count != null && count >= MAX_POINTS) {
            throw new BusinessException("当前旅行最多允许 120 个记忆点");
        }
        // MySQL LAST_INSERT_ID() 是当前连接级别的值，此处直接用 JDBC GeneratedKeyHolder 最稳妥。
        org.springframework.jdbc.support.KeyHolder holder = new org.springframework.jdbc.support.GeneratedKeyHolder();
        jdbc.update(conn -> {
            java.sql.PreparedStatement stmt = conn.prepareStatement(
                "INSERT INTO travel_point " +
                "(travel_id, media_id, title, subtitle, content, location_name, travel_date, x_ratio, y_ratio, sort_order) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                java.sql.Statement.RETURN_GENERATED_KEYS);
            fillStatement(stmt, travelId, request);
            return stmt;
        }, holder);
        if (holder.getKey() == null) throw new BusinessException("新建记忆点后未获得 ID");
        return readPoint(travelId, holder.getKey().longValue());
    }

    public TravelPointVO updatePoint(Long travelId, Long pointId, Long userId,
                                     TravelPointRequest request) {
        requireOwner(travelId, userId);
        requirePointBelongs(travelId, pointId);
        validate(travelId, request);
        int changed = jdbc.update(
            "UPDATE travel_point SET media_id=?, title=?, subtitle=?, content=?, location_name=?, " +
            "travel_date=?, x_ratio=?, y_ratio=?, sort_order=? WHERE travel_id=? AND id=?",
            request.getMediaId(), request.getTitle().trim(), trim(request.getSubtitle(), 150),
            trim(request.getContent(), 10000), trim(request.getLocationName(), 120),
            dateValue(request.getTravelDate()), request.getXRatio(), request.getYRatio(),
            request.getSortOrder() == null ? 0 : request.getSortOrder(), travelId, pointId);
        if (changed != 1) throw new BusinessException(404, "记忆点不存在");
        return readPoint(travelId, pointId);
    }

    public void deletePoint(Long travelId, Long pointId, Long userId) {
        requireOwner(travelId, userId);
        int changed = jdbc.update(
            "DELETE FROM travel_point WHERE id = ? AND travel_id = ?", pointId, travelId);
        if (changed != 1) throw new BusinessException(404, "记忆点不存在");
    }

    private void requirePointBelongs(Long travelId, Long pointId) {
        if (pointId == null || pointId <= 0) throw new BusinessException(404, "记忆点不存在");
        Integer count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM travel_point WHERE id = ? AND travel_id = ?",
            Integer.class, pointId, travelId);
        if (count == null || count != 1) throw new BusinessException(404, "记忆点不存在");
    }

    private TravelPointVO readPoint(Long travelId, Long pointId) {
        return getMapPoints(travelId).stream().filter(p -> pointId.equals(p.getId()))
            .findFirst().orElseThrow(() -> new BusinessException(404, "记忆点不存在"));
    }

    // 读刚保存的点，无额外 N+1 请求，复用相同的 SQL 映射逻辑（由安全检查的操作入口调用）。
    private List<TravelPointVO> getMapPoints(Long travelId) {
        return jdbc.query(
            "SELECT id, travel_id, media_id, title, subtitle, content, location_name, travel_date, " +
            "x_ratio, y_ratio, sort_order, created_at, updated_at FROM travel_point WHERE travel_id = ?",
            (rs, n) -> {
                TravelPointVO vo = new TravelPointVO();
                vo.setId(rs.getLong("id"));
                vo.setTravelId(rs.getLong("travel_id"));
                vo.setMediaId(longValue(rs.getObject("media_id")));
                vo.setTitle(rs.getString("title"));
                vo.setSubtitle(rs.getString("subtitle"));
                vo.setContent(rs.getString("content"));
                vo.setLocationName(rs.getString("location_name"));
                Date date = rs.getDate("travel_date");
                vo.setTravelDate(date == null ? null : date.toLocalDate());
                vo.setXRatio(rs.getDouble("x_ratio"));
                vo.setYRatio(rs.getDouble("y_ratio"));
                vo.setSortOrder(rs.getInt("sort_order"));
                if (rs.getTimestamp("created_at") != null)
                    vo.setCreatedAt(rs.getTimestamp("created_at").toLocalDateTime());
                if (rs.getTimestamp("updated_at") != null)
                    vo.setUpdatedAt(rs.getTimestamp("updated_at").toLocalDateTime());
                return vo;
            }, travelId);
    }

    private void fillStatement(java.sql.PreparedStatement stmt, Long travelId,
                               TravelPointRequest r) throws java.sql.SQLException {
        stmt.setLong(1, travelId);
        if (r.getMediaId() == null) stmt.setNull(2, java.sql.Types.BIGINT);
        else stmt.setLong(2, r.getMediaId());
        stmt.setString(3, r.getTitle().trim());
        stmt.setString(4, trim(r.getSubtitle(), 150));
        stmt.setString(5, trim(r.getContent(), 10000));
        stmt.setString(6, trim(r.getLocationName(), 120));
        if (r.getTravelDate() == null) stmt.setNull(7, java.sql.Types.DATE);
        else stmt.setDate(7, Date.valueOf(r.getTravelDate()));
        stmt.setDouble(8, r.getXRatio());
        stmt.setDouble(9, r.getYRatio());
        stmt.setInt(10, r.getSortOrder() == null ? 0 : r.getSortOrder());
    }

    private void validate(Long travelId, TravelPointRequest r) {
        if (r == null) throw new BusinessException("记忆点不能为空");
        if (r.getTitle() == null || r.getTitle().trim().isEmpty() || r.getTitle().trim().length() > 80) {
            throw new BusinessException("标题不能为空且不得超过 80 字");
        }
        if (r.getXRatio() == null || r.getYRatio() == null ||
            !Double.isFinite(r.getXRatio()) || !Double.isFinite(r.getYRatio()) ||
            r.getXRatio() < 0 || r.getXRatio() > 1 || r.getYRatio() < 0 || r.getYRatio() > 1) {
            throw new BusinessException("记忆点坐标必须在 0 到 1 之间");
        }
        if (r.getSubtitle() != null && r.getSubtitle().length() > 150) throw new BusinessException("副标题最多 150 字");
        if (r.getContent() != null && r.getContent().length() > 10000) throw new BusinessException("正文最多 10000 字");
        if (r.getLocationName() != null && r.getLocationName().length() > 120) throw new BusinessException("地点名称最多 120 字");
        if (r.getSortOrder() != null && (r.getSortOrder() < 0 || r.getSortOrder() > 100000)) {
            throw new BusinessException("排序号必须在 0 到 100000 之间");
        }
        checkPhoto(travelId, r.getMediaId());
    }

    private static Date dateValue(LocalDate day) { return day == null ? null : Date.valueOf(day); }
    private static String trim(String text, int maxLen) {
        if (text == null) return null;
        String result = text.trim();
        return result.isEmpty() ? null : result.substring(0, Math.min(result.length(), maxLen));
    }
    private static Long longValue(Object value) {
        return value instanceof Number ? ((Number) value).longValue() : null;
    }
    private static Integer intValue(Object value) {
        return value instanceof Number ? ((Number) value).intValue() : null;
    }
}
