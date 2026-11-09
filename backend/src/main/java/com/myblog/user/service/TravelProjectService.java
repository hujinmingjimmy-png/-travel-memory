package com.myblog.user.service;

import com.myblog.user.dto.CreateTravelRequest;
import com.myblog.user.vo.TravelProjectVO;

import java.util.List;

/**
 * 旅行项目业务接口。
 */
public interface TravelProjectService {

    /**
     * 创建旅行。
     */
    Long createTravel(
            Long userId,
            CreateTravelRequest request
    );

    /**
     * 查询当前用户自己的所有旅行。
     */
    List<TravelProjectVO> getMyTravels(
            Long userId
    );

    /**
     * 查询旅行详情。
     */
    TravelProjectVO getTravelDetail(
            Long currentUserId,
            Long travelId
    );

    /**
     * 首页随机获取一段
     * 已公开 + 已发布旅行。
     */
    TravelProjectVO getRandomPublicTravel();

    /**
     * 发布旅行。
     *
     * 只有旅行创建者自己能发布。
     */
    void publishTravel(
            Long userId,
            Long travelId
    );
}
