package com.myblog.user.controller;

import com.myblog.user.common.ApiResult;
import com.myblog.user.dto.RealMapPointRequest;
import com.myblog.user.service.TravelRealMapService;
import com.myblog.user.vo.RealMapPointVO;
import org.springframework.web.bind.annotation.*;
import java.util.List;

/**
 * 高德真实地图：独立 URL，不覆盖旧版 /map 手账地图接口。
 * 所有接口沿用现有 AuthInterceptor 的 JWT。
 */
@RestController
@RequestMapping("/api/travels/{travelId}/real-map/points")
public class TravelRealMapController {
    private final TravelRealMapService service;
    public TravelRealMapController(TravelRealMapService service) { this.service = service; }

    /** 创建者可以看私密/草稿，访客仅可看 PUBLIC + 已发布。 */
    @GetMapping
    public ApiResult<List<RealMapPointVO>> list(@PathVariable("travelId") Long travelId,
            @RequestAttribute("userId") Long userId) {
        return ApiResult.success(service.list(travelId, userId));
    }

    @PostMapping
    public ApiResult<RealMapPointVO> create(@PathVariable("travelId") Long travelId,
            @RequestAttribute("userId") Long userId, @RequestBody RealMapPointRequest request) {
        return ApiResult.success("真实地图记忆点已创建", service.create(travelId, userId, request));
    }

    @PutMapping("/{pointId}")
    public ApiResult<RealMapPointVO> update(@PathVariable("travelId") Long travelId,
            @PathVariable("pointId") Long pointId, @RequestAttribute("userId") Long userId,
            @RequestBody RealMapPointRequest request) {
        return ApiResult.success("真实地图记忆点已保存", service.update(travelId, pointId, userId, request));
    }


    public record CustomAnchorRequest(Double longitude, Double latitude) {}
    /** Only the owner can confirm geolocation of an existing CUSTOM memory. */
    @PutMapping("/anchors/{pointId}")
    public ApiResult<Boolean> anchor(@PathVariable("travelId") Long travelId,
            @PathVariable("pointId") Long pointId, @RequestAttribute("userId") Long userId,
            @RequestBody CustomAnchorRequest request) {
        if(request==null) throw new com.myblog.user.exception.BusinessException("必须提供地点坐标");
        service.anchorCustom(travelId,pointId,userId,request.longitude(),request.latitude());
        return ApiResult.success("已为原手账记忆关联真实位置",true);
    }

    @DeleteMapping("/{pointId}")
    public ApiResult<Boolean> remove(@PathVariable("travelId") Long travelId,
            @PathVariable("pointId") Long pointId, @RequestAttribute("userId") Long userId) {
        service.delete(travelId, pointId, userId);
        return ApiResult.success("记忆点已删除", true);
    }
}
