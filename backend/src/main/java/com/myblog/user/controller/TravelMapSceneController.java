package com.myblog.user.controller;

import com.myblog.user.common.ApiResult;
import com.myblog.user.dto.TravelMapSceneRequest;
import com.myblog.user.service.TravelMapSceneService;
import com.myblog.user.vo.TravelMapSceneVO;
import org.springframework.web.bind.annotation.*;

/** 手账地图来源与真实地图卡通取景设置。 */
@RestController
@RequestMapping("/api/travels/{travelId}/map/scene")
public class TravelMapSceneController {
    private final TravelMapSceneService service;

    public TravelMapSceneController(TravelMapSceneService service) {
        this.service = service;
    }

    @GetMapping
    public ApiResult<TravelMapSceneVO> get(@PathVariable("travelId") Long travelId,
                                            @RequestAttribute("userId") Long userId) {
        return ApiResult.success(service.get(travelId, userId));
    }

    @PutMapping
    public ApiResult<TravelMapSceneVO> save(@PathVariable("travelId") Long travelId,
                                             @RequestAttribute("userId") Long userId,
                                             @RequestBody TravelMapSceneRequest request) {
        return ApiResult.success("地图场景已保存", service.save(travelId, userId, request));
    }
}
