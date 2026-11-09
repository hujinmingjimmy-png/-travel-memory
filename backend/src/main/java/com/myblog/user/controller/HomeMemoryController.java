package com.myblog.user.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.myblog.user.common.ApiResult;
import com.myblog.user.entity.TravelMedia;
import com.myblog.user.entity.TravelProject;
import com.myblog.user.entity.User;
import com.myblog.user.mapper.TravelMediaMapper;
import com.myblog.user.mapper.TravelProjectMapper;
import com.myblog.user.mapper.UserMapper;
import com.myblog.user.vo.HomeMemoryVO;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * ★★★★★【仅显示当前登录用户自己的主题】★★★★★
 * 一次旅行 = 一个主题；每个主题分别有主封面、背景场景。
 * 私密和草稿均允许自己的首页展示；/discover 将来独立查询公开发布内容。
 */
@RestController
@RequestMapping("/api/home")
public class HomeMemoryController {
    private final TravelProjectMapper travelMapper;
    private final TravelMediaMapper mediaMapper;
    private final UserMapper userMapper;
    private final JdbcTemplate jdbc;

    public HomeMemoryController(TravelProjectMapper travelMapper,
                                TravelMediaMapper mediaMapper,
                                UserMapper userMapper,
                                JdbcTemplate jdbc) {
        this.travelMapper = travelMapper;
        this.mediaMapper = mediaMapper;
        this.userMapper = userMapper;
        this.jdbc = jdbc;
    }

    @GetMapping("/memories")
    public ApiResult<List<HomeMemoryVO>> memories(@RequestAttribute("userId") Long userId) {
        List<TravelProject> projects = travelMapper.selectList(
            new LambdaQueryWrapper<TravelProject>()
                .eq(TravelProject::getUserId, userId)
                .orderByDesc(TravelProject::getCreatedAt)
                .last("LIMIT 60"));
        if (projects.isEmpty()) return ApiResult.success(Collections.emptyList());

        List<Long> ids = projects.stream().map(TravelProject::getId).toList();
        List<TravelMedia> photos = mediaMapper.selectList(
            new LambdaQueryWrapper<TravelMedia>()
                .in(TravelMedia::getTravelId, ids)
                .orderByAsc(TravelMedia::getSortOrder)
                .orderByAsc(TravelMedia::getId));

        Map<Long, List<TravelMedia>> grouped = new HashMap<>();
        for (TravelMedia media : photos) {
            grouped.computeIfAbsent(media.getTravelId(), id -> new ArrayList<>()).add(media);
        }

        // 已有 travel_project 实体不需要修改，单独读取本次增加的主封面/背景照片 ID。
        Map<Long, Long[]> themeSelection = new HashMap<>();
        for (Map<String, Object> row : jdbc.queryForList(
                "SELECT id, cover_media_id, background_media_id FROM travel_project WHERE user_id = ?", userId)) {
            Long id = ((Number) row.get("id")).longValue();
            themeSelection.put(id, new Long[] {
                asLong(row.get("cover_media_id")),
                asLong(row.get("background_media_id"))
            });
        }

        User owner = userMapper.selectById(userId);
        String author = owner == null ? "旅行者" : nonEmpty(owner.getNickname(), owner.getUsername());
        List<HomeMemoryVO> result = new ArrayList<>();
        for (TravelProject project : projects) {
            List<TravelMedia> album = grouped.getOrDefault(project.getId(), Collections.emptyList());
            Long[] setting = themeSelection.getOrDefault(project.getId(), new Long[] {null, null});

            // 保存过的指定图片找不到（比如被删除）时，自动回退到相册前两张。
            Long coverId = chooseMedia(setting[0], album, 0);
            Long backgroundId = chooseMedia(setting[1], album, album.size() > 1 ? 1 : 0);
            String coverUrl = nonEmpty(project.getCoverUrl(), null);
            String backgroundUrl = nonEmpty(project.getBackgroundUrl(), null);
            if (coverId == null && coverUrl == null) continue;

            HomeMemoryVO vo = new HomeMemoryVO();
            vo.setTravelId(project.getId());
            vo.setTitle(project.getTitle());
            vo.setSubtitle(project.getSubtitle());
            vo.setCaption(nonEmpty(project.getSubtitle(),
                nonEmpty(project.getDescription(), "回忆停在了这一刻。")));
            vo.setAuthor(author);
            vo.setVisibility(project.getVisibility());
            vo.setCoverMediaId(coverId);
            vo.setBackgroundMediaId(backgroundId);
            vo.setCoverUrl(coverUrl);
            vo.setBackgroundUrl(backgroundUrl);
            result.add(vo);
        }
        return ApiResult.success(result);
    }

    private Long chooseMedia(Long selected, List<TravelMedia> album, int fallbackIndex) {
        if (selected != null) {
            for (TravelMedia media : album) {
                if (selected.equals(media.getId())) return selected;
            }
        }
        if (album.isEmpty()) return null;
        return album.get(Math.min(fallbackIndex, album.size() - 1)).getId();
    }

    private Long asLong(Object value) {
        return value instanceof Number ? ((Number) value).longValue() : null;
    }

    private String nonEmpty(String a, String fallback) {
        return a != null && !a.isBlank() ? a : fallback;
    }
}
