package com.myblog.user.controller;

import com.myblog.user.common.ApiResult;
import com.myblog.user.dto.TravelMapBackgroundRequest;
import com.myblog.user.dto.TravelPointRequest;
import com.myblog.user.service.TravelMapService;
import com.myblog.user.vo.TravelMapVO;
import com.myblog.user.vo.TravelPointVO;
import org.springframework.web.bind.annotation.*;

/**
 * 地图模式：只增加新路由，不覆盖原有 TravelProjectController / 照片上传控制器。
 * 所有接口都经过现有 AuthInterceptor 的 JWT 校验。
 */
@RestController
@RequestMapping("/api/travels/{travelId}/map")
public class TravelMapController {
    private final TravelMapService service;
    public TravelMapController(TravelMapService service) { this.service = service; }

    /** 所属用户能看私密草稿，其他账号只能看公开且已发布的旅行。 */
    @GetMapping
    public ApiResult<TravelMapVO> read(@PathVariable("travelId") Long travelId,
                                       @RequestAttribute("userId") Long userId) {
        return ApiResult.success(service.getMap(travelId, userId));
    }

    /** 只允许创建者设置地图独立背景。 */
    @PutMapping("/background")
    public ApiResult<Boolean> background(@PathVariable("travelId") Long travelId,
                                         @RequestAttribute("userId") Long userId,
                                         @RequestBody TravelMapBackgroundRequest request) {
        service.setBackground(travelId, userId, request);
        return ApiResult.success("地图背景已保存", true);
    }

    /** 新增记忆点。 */
    @PostMapping("/points")
    public ApiResult<TravelPointVO> add(@PathVariable("travelId") Long travelId,
                                         @RequestAttribute("userId") Long userId,
                                         @RequestBody TravelPointRequest request) {
        return ApiResult.success("记忆点创建成功", service.createPoint(travelId, userId, request));
    }

    /** 更新记忆点内容或拖动后的坐标。 */
    @PutMapping("/points/{pointId}")
    public ApiResult<TravelPointVO> update(@PathVariable("travelId") Long travelId,
                                           @PathVariable("pointId") Long pointId,
                                           @RequestAttribute("userId") Long userId,
                                           @RequestBody TravelPointRequest request) {
        return ApiResult.success("记忆点已保存", service.updatePoint(travelId, pointId, userId, request));
    }

    @DeleteMapping("/points/{pointId}")
    public ApiResult<Boolean> remove(@PathVariable("travelId") Long travelId,
                                     @PathVariable("pointId") Long pointId,
                                     @RequestAttribute("userId") Long userId) {
        service.deletePoint(travelId, pointId, userId);
        return ApiResult.success("记忆点已删除", true);
    }
}
