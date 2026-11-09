package com.myblog.user.controller;

import com.myblog.user.common.ApiResult;
import com.myblog.user.dto.ImmersiveSceneRequest;
import com.myblog.user.service.ImmersivePlaybackService;
import com.myblog.user.vo.ImmersiveSceneVO;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/travels/{travelId}/immersive")
public class ImmersivePlaybackController {

    private final ImmersivePlaybackService service;

    public ImmersivePlaybackController(
            ImmersivePlaybackService service
    ) {
        this.service = service;
    }

    @GetMapping("/scenes")
    public ApiResult<List<ImmersiveSceneVO>> getScenes(
            @PathVariable("travelId") Long travelId,
            @RequestAttribute("userId") Long userId
    ) {
        return ApiResult.success(
                service.list(
                        travelId,
                        userId
                )
        );
    }

    @PutMapping("/scenes/{pointId}")
    public ApiResult<ImmersiveSceneVO> updateScene(
            @PathVariable("travelId") Long travelId,
            @PathVariable("pointId") Long pointId,
            @RequestAttribute("userId") Long userId,
            @RequestBody ImmersiveSceneRequest request
    ) {
        return ApiResult.success(
                service.update(
                        travelId,
                        pointId,
                        userId,
                        request
                )
        );
    }
}
