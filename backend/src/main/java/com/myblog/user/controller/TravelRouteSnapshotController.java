package com.myblog.user.controller;

import com.myblog.user.common.ApiResult;
import com.myblog.user.dto.TravelRouteWriteRequest;
import com.myblog.user.service.TravelRouteSnapshotService;
import com.myblog.user.vo.TravelRouteStateVO;
import org.springframework.web.bind.annotation.*;

/** Uses existing /api/** JWT interceptor and travel access policy. */
@RestController
@RequestMapping("/api/travels/{travelId}/route")
public class TravelRouteSnapshotController {
    private final TravelRouteSnapshotService service;

    public TravelRouteSnapshotController(TravelRouteSnapshotService service) {
        this.service = service;
    }

    @GetMapping
    public ApiResult<TravelRouteStateVO> get(
            @PathVariable("travelId") Long travelId,
            @RequestAttribute("userId") Long userId) {
        return ApiResult.success(service.read(travelId, userId));
    }

    @PutMapping
    public ApiResult<TravelRouteStateVO> put(
            @PathVariable("travelId") Long travelId,
            @RequestAttribute("userId") Long userId,
            @RequestBody TravelRouteWriteRequest request) {
        return ApiResult.success("Route snapshot saved", service.save(travelId, userId, request));
    }
}
