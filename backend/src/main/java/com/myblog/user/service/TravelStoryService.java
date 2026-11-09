package com.myblog.user.service;

import com.myblog.user.exception.BusinessException;
import com.myblog.user.vo.TravelStoryPointVO;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Date;
import java.util.List;
import java.util.Map;

/**
 * 第 9 阶段：将 CUSTOM 手账点 + REAL 实景点读取成统一故事列表。
 * 这个接口仅查询，不新增或修改数据库数据。
 */
@Service
public class TravelStoryService {
    private final JdbcTemplate jdbc;

    public TravelStoryService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public List<TravelStoryPointVO> list(Long travelId, Long userId) {
        if (travelId == null || travelId <= 0 || userId == null) {
            throw new BusinessException(404, "旅行不存在");
        }
        List<Map<String, Object>> projects = jdbc.queryForList(
            "SELECT user_id, visibility, is_published FROM travel_project WHERE id = ?", travelId);
        if (projects.isEmpty()) throw new BusinessException(404, "旅行不存在");
        Map<String, Object> project = projects.get(0);
        Object ownerValue = project.get("user_id");
        boolean owner = ownerValue instanceof Number &&
                userId.longValue() == ((Number) ownerValue).longValue();
        Object publishedValue = project.get("is_published");
        boolean publicPublished = "PUBLIC".equals(project.get("visibility")) &&
                publishedValue instanceof Number && ((Number) publishedValue).intValue() == 1;
        if (!owner && !publicPublished) {
            // 对私密旅行不暴露是否存在。
            throw new BusinessException(404, "旅行不存在或无权访问");
        }
        return jdbc.query(
            "SELECT id, travel_id, point_type, media_id, title, subtitle, content, location_name, " +
            "travel_date, sort_order, x_ratio, y_ratio, longitude, latitude " +
            "FROM travel_point WHERE travel_id = ? " +
            "AND point_type IN ('CUSTOM','REAL') ORDER BY sort_order, id LIMIT 300",
            (rs, rowNo) -> {
                TravelStoryPointVO item = new TravelStoryPointVO();
                item.setId(rs.getLong("id"));
                item.setTravelId(rs.getLong("travel_id"));
                item.setPointType(rs.getString("point_type"));
                Object media = rs.getObject("media_id");
                item.setMediaId(media instanceof Number ? ((Number) media).longValue() : null);
                item.setTitle(rs.getString("title"));
                item.setSubtitle(rs.getString("subtitle"));
                item.setContent(rs.getString("content"));
                item.setLocationName(rs.getString("location_name"));
                Date day = rs.getDate("travel_date");
                item.setTravelDate(day == null ? null : day.toLocalDate());
                item.setSortOrder(rs.getInt("sort_order"));
                // 只为对应场景返回坐标，防止前端把两种地图坐标混用。
                if ("REAL".equals(item.getPointType())) {
                    item.setLongitude(nullableDouble(rs.getObject("longitude")));
                    item.setLatitude(nullableDouble(rs.getObject("latitude")));
                } else {
                    item.setXRatio(nullableDouble(rs.getObject("x_ratio")));
                    item.setYRatio(nullableDouble(rs.getObject("y_ratio")));
                    // Optional georeference of the SAME CUSTOM row; never converts
                    // journal coordinates or creates a duplicate REAL memory.
                    item.setLongitude(nullableDouble(rs.getObject("longitude")));
                    item.setLatitude(nullableDouble(rs.getObject("latitude")));
                }
                return item;
            }, travelId);
    }

    private static Double nullableDouble(Object v) {
        return v instanceof Number ? ((Number) v).doubleValue() : null;
    }
}
