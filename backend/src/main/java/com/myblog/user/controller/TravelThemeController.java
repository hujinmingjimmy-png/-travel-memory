package com.myblog.user.controller;

import com.myblog.user.common.ApiResult;
import com.myblog.user.dto.ThemeArtRequest;
import com.myblog.user.entity.TravelMedia;
import com.myblog.user.entity.TravelProject;
import com.myblog.user.exception.BusinessException;
import com.myblog.user.mapper.TravelMediaMapper;
import com.myblog.user.mapper.TravelProjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 当前创建者为自己的旅行设置独立的主封面和背景画面。 */
@RestController
@RequestMapping("/api/travels/{travelId}/theme")
public class TravelThemeController {
    private final TravelProjectMapper projects;
    private final TravelMediaMapper media;
    private final JdbcTemplate jdbc;

    public TravelThemeController(TravelProjectMapper projects, TravelMediaMapper media, JdbcTemplate jdbc) {
        this.projects = projects;
        this.media = media;
        this.jdbc = jdbc;
    }

    @GetMapping
    public ApiResult<Map<String, Long>> get(@PathVariable("travelId") Long travelId,
                                            @RequestAttribute("userId") Long userId) {
        TravelProject travel = projects.selectById(travelId);
        if(travel==null)throw new BusinessException(404,"旅行不存在");
        boolean owner=userId!=null&&userId.equals(travel.getUserId());
        if(!owner&&!("PUBLIC".equals(travel.getVisibility())&&Integer.valueOf(1).equals(travel.getIsPublished())))throw new BusinessException(403,"旅行未公开");
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT cover_media_id, background_media_id FROM travel_project WHERE id = ?",
            travelId);
        if (rows.isEmpty()) throw new BusinessException(404, "旅行不存在");
        Map<String, Long> result = new LinkedHashMap<>();
        result.put("coverMediaId", toLong(rows.get(0).get("cover_media_id")));
        result.put("backgroundMediaId", toLong(rows.get(0).get("background_media_id")));
        return ApiResult.success(result);
    }

    @PutMapping
    public ApiResult<Boolean> save(@PathVariable("travelId") Long travelId,
                                   @RequestAttribute("userId") Long userId,
                                   @RequestBody ThemeArtRequest request) {
        assertOwner(travelId, userId);
        if (request == null || request.getCoverMediaId() == null || request.getBackgroundMediaId() == null) {
            throw new BusinessException("请分别选择主封面和背景画面");
        }
        assertMediaBelongsToTravel(request.getCoverMediaId(), travelId);
        assertMediaBelongsToTravel(request.getBackgroundMediaId(), travelId);
        int count = jdbc.update(
            "UPDATE travel_project SET cover_media_id = ?, background_media_id = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND user_id = ?",
            request.getCoverMediaId(), request.getBackgroundMediaId(), travelId, userId);
        if (count != 1) throw new BusinessException(403, "无法修改其他用户的旅行");
        return ApiResult.success("主题主封面和背景已保存", true);
    }

    private void assertOwner(Long travelId, Long userId) {
        TravelProject travel = projects.selectById(travelId);
        if (travel == null) throw new BusinessException(404, "旅行不存在");
        if (userId == null || !userId.equals(travel.getUserId())) {
            throw new BusinessException(403, "只能修改自己旅行的主题图片");
        }
    }

    private void assertMediaBelongsToTravel(Long mediaId, Long travelId) {
        TravelMedia photo = media.selectById(mediaId);
        if (photo == null || !travelId.equals(photo.getTravelId())) {
            throw new BusinessException("主封面和背景必须选自该旅行的照片");
        }
    }

    private Long toLong(Object value) {
        return value instanceof Number ? ((Number) value).longValue() : null;
    }
}
