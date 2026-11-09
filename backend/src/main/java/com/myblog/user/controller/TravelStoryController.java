package com.myblog.user.controller;

import com.myblog.user.common.ApiResult;
import com.myblog.user.service.TravelStoryService;
import com.myblog.user.vo.TravelStoryPointVO;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;

/** 第9阶段：统一故事时间线，只读 JWT 授权内容。 */
@RestController
@RequestMapping("/api/travels/{travelId}/story")
public class TravelStoryController {
    private final TravelStoryService service;
    public TravelStoryController(TravelStoryService service) { this.service = service; }

    @GetMapping("/points")
    public ApiResult<List<TravelStoryPointVO>> getStoryPoints(
            @PathVariable("travelId") Long travelId,
            @RequestAttribute("userId") Long userId) {
        return ApiResult.success(service.list(travelId, userId));
    }
}
