package com.myblog.user.controller;

import com.myblog.user.common.ApiResult;
import com.myblog.user.dto.CreateTravelRequest;
import com.myblog.user.service.TravelProjectService;
import com.myblog.user.vo.TravelProjectVO;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 旅行项目 Controller。
 */
@RestController
@RequestMapping("/api/travels")
public class TravelProjectController {

    private final TravelProjectService
            travelProjectService;

    public TravelProjectController(
            TravelProjectService travelProjectService) {

        this.travelProjectService =
                travelProjectService;
    }

    /**
     * 创建旅行。
     */
    @PostMapping
    public ApiResult<Long> createTravel(
            @RequestAttribute("userId")
            Long userId,

            @RequestBody
            CreateTravelRequest request) {

        Long travelId =
                travelProjectService
                        .createTravel(
                                userId,
                                request
                        );

        return ApiResult.success(
                "创建旅行成功",
                travelId
        );
    }

    /**
     * 我的旅程。
     */
    @GetMapping("/my")
    public ApiResult<List<TravelProjectVO>>
    getMyTravels(
            @RequestAttribute("userId")
            Long userId) {

        return ApiResult.success(
                travelProjectService
                        .getMyTravels(userId)
        );
    }

    /**
     * 首页随机旅行。
     */
    @GetMapping("/home/random")
    public ApiResult<TravelProjectVO>
    getRandomPublicTravel() {

        return ApiResult.success(
                travelProjectService
                        .getRandomPublicTravel()
        );
    }

    /**
     * 发布旅行。
     */
    @PostMapping("/{id}/publish")
    public ApiResult<Boolean> publishTravel(
            @RequestAttribute("userId")
            Long userId,

            @PathVariable("id")
            Long travelId) {

        travelProjectService.publishTravel(
                userId,
                travelId
        );

        return ApiResult.success(
                "发布旅行成功",
                true
        );
    }

    /**
     * 查询旅行详情。
     *
     * 放在 /home/random 等固定路径之后，
     * 阅读上更清晰。
     */
    @GetMapping("/{id}")
    public ApiResult<TravelProjectVO>
    getTravelDetail(
            @RequestAttribute("userId")
            Long userId,

            @PathVariable("id")
            Long travelId) {

        return ApiResult.success(
                travelProjectService
                        .getTravelDetail(
                                userId,
                                travelId
                        )
        );
    }
}
