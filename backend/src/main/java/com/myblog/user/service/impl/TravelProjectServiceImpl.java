package com.myblog.user.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.myblog.user.dto.CreateTravelRequest;
import com.myblog.user.entity.TravelProject;
import com.myblog.user.exception.BusinessException;
import com.myblog.user.mapper.TravelProjectMapper;
import com.myblog.user.service.TravelProjectService;
import com.myblog.user.vo.TravelProjectVO;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;

/**
 * 旅行项目业务实现。
 */
@Service
public class TravelProjectServiceImpl
        implements TravelProjectService {

    private final TravelProjectMapper
            travelProjectMapper;

    public TravelProjectServiceImpl(
            TravelProjectMapper travelProjectMapper) {

        this.travelProjectMapper =
                travelProjectMapper;
    }

    /**
     * 创建旅行。
     */
    @Override
    public Long createTravel(
            Long userId,
            CreateTravelRequest request) {

        if (userId == null) {
            throw new BusinessException(
                    401,
                    "当前登录用户无效"
            );
        }

        if (request == null) {
            throw new BusinessException(
                    "旅行信息不能为空"
            );
        }

        if (request.getTitle() == null
                || request.getTitle()
                .trim()
                .isEmpty()) {

            throw new BusinessException(
                    "旅行标题不能为空"
            );
        }

        String title =
                request.getTitle().trim();

        if (title.length() > 100) {
            throw new BusinessException(
                    "旅行标题不能超过100个字符"
            );
        }

        validateLength(request.getSubtitle(),200,"副标题");
        validateLength(request.getDescription(),20000,"简介");
        validateLength(request.getCoverUrl(),500,"封面地址");
        validateLength(request.getBackgroundUrl(),500,"背景地址");
        LocalDate startDate =
                request.getStartDate();

        LocalDate endDate =
                request.getEndDate();

        if (startDate != null
                && endDate != null
                && endDate.isBefore(startDate)) {

            throw new BusinessException(
                    "结束日期不能早于开始日期"
            );
        }

        String visibility =
                normalizeVisibility(
                        request.getVisibility()
                );

        TravelProject travel =
                new TravelProject();

        /*
         * userId 来自 JWT。
         */
        travel.setUserId(userId);

        travel.setTitle(title);

        travel.setSubtitle(
                trimToNull(
                        request.getSubtitle()
                )
        );

        travel.setDescription(
                trimToNull(
                        request.getDescription()
                )
        );

        travel.setCoverUrl(
                normalizeImageUrl(
                        request.getCoverUrl()
                )
        );

        travel.setBackgroundUrl(
                normalizeImageUrl(
                        request.getBackgroundUrl()
                )
        );

        travel.setStartDate(startDate);

        travel.setEndDate(endDate);

        travel.setVisibility(visibility);

        /*
         * 新建默认草稿。
         */
        travel.setIsPublished(0);

        travel.setViewCount(0L);

        travel.setLikeCount(0L);

        travelProjectMapper.insert(
                travel
        );

        return travel.getId();
    }

    /**
     * 我的旅程。
     */
    @Override
    public List<TravelProjectVO> getMyTravels(
            Long userId) {

        List<TravelProject> list =
                travelProjectMapper.selectList(
                        new LambdaQueryWrapper<TravelProject>()
                                .eq(
                                        TravelProject::getUserId,
                                        userId
                                )
                                .orderByDesc(
                                        TravelProject::getCreatedAt
                                )
                );

        return list.stream()
                .map(this::toVO)
                .toList();
    }

    /**
     * 旅行详情。
     */
    @Override
    public TravelProjectVO getTravelDetail(
            Long currentUserId,
            Long travelId) {

        if (travelId == null) {
            throw new BusinessException(
                    "旅行ID不能为空"
            );
        }

        TravelProject travel =
                travelProjectMapper.selectById(
                        travelId
                );

        if (travel == null) {
            throw new BusinessException(
                    404,
                    "旅行不存在"
            );
        }

        boolean isOwner =
                currentUserId != null
                        && currentUserId.equals(
                                travel.getUserId()
                        );

        boolean isPublicPublished =
                "PUBLIC".equals(
                        travel.getVisibility()
                )
                        && Integer.valueOf(1)
                        .equals(
                                travel.getIsPublished()
                        );

        if (!isOwner
                && !isPublicPublished) {

            throw new BusinessException(
                    403,
                    "没有权限查看这段旅行"
            );
        }

        return toVO(travel);
    }

    /**
     * 首页随机公开旅行。
     */
    @Override
    public TravelProjectVO
    getRandomPublicTravel() {

        TravelProject travel =
                travelProjectMapper.selectOne(
                        new LambdaQueryWrapper<TravelProject>()
                                .eq(
                                        TravelProject::getVisibility,
                                        "PUBLIC"
                                )
                                .eq(
                                        TravelProject::getIsPublished,
                                        1
                                )
                                .last(
                                        "ORDER BY RAND() LIMIT 1"
                                )
                );

        if (travel == null) {
            return null;
        }

        return toVO(travel);
    }

    /**
     * 发布旅行。
     */
    @Override
    public void publishTravel(
            Long userId,
            Long travelId) {

        if (userId == null) {
            throw new BusinessException(
                    401,
                    "当前登录用户无效"
            );
        }

        if (travelId == null) {
            throw new BusinessException(
                    "旅行ID不能为空"
            );
        }

        TravelProject travel =
                travelProjectMapper.selectById(
                        travelId
                );

        if (travel == null) {
            throw new BusinessException(
                    404,
                    "旅行不存在"
            );
        }

        /*
         * 只能发布自己的旅行。
         */
        if (!userId.equals(
                travel.getUserId()
        )) {
            throw new BusinessException(
                    403,
                    "不能发布其他用户的旅行"
            );
        }

        if (Integer.valueOf(1)
                .equals(
                        travel.getIsPublished()
                )) {
            return;
        }

        /*
         * 当前第一版允许：
         *
         * PRIVATE + 已发布
         *
         * 这种状态。
         *
         * PRIVATE 代表：
         * 只有自己能看。
         *
         * PUBLIC + 已发布：
         * 才会进入首页随机展示。
         */
        travel.setIsPublished(1);

        travelProjectMapper.updateById(
                travel
        );
    }

    /**
     * PRIVATE / PUBLIC 规范化。
     */
    private void validateLength(String value,int max,String name){if(value!=null&&value.trim().length()>max)throw new BusinessException(name+"长度超出允许范围");}
    private String normalizeVisibility(
            String visibility) {

        if (visibility == null
                || visibility.trim()
                .isEmpty()) {

            return "PRIVATE";
        }

        String normalized =
                visibility
                        .trim()
                        .toUpperCase();

        if (!"PRIVATE".equals(normalized)
                && !"PUBLIC".equals(normalized)) {

            throw new BusinessException(
                    "visibility 只能是 PRIVATE 或 PUBLIC"
            );
        }

        return normalized;
    }

    /**
     * 与 TravelManageService 的规则保持一致：
     * 只允许站内 /images/ 或 HTTPS 图片地址。
     */
    private String normalizeImageUrl(
            String value) {

        String result =
                trimToNull(value);

        if (result == null) {
            return null;
        }

        if (!result.startsWith("/images/")
                && !result.startsWith("https://")) {
            throw new BusinessException(
                    "图片地址须为https地址或/images/资源路径"
            );
        }

        return result;
    }

    /**
     * 空字符串转 null。
     */
    private String trimToNull(
            String value) {

        if (value == null) {
            return null;
        }

        String result =
                value.trim();

        return result.isEmpty()
                ? null
                : result;
    }

    /**
     * Entity -> VO。
     */
    private TravelProjectVO toVO(
            TravelProject travel) {

        TravelProjectVO vo =
                new TravelProjectVO();

        vo.setId(
                travel.getId()
        );

        vo.setUserId(
                travel.getUserId()
        );

        vo.setTitle(
                travel.getTitle()
        );

        vo.setSubtitle(
                travel.getSubtitle()
        );

        vo.setDescription(
                travel.getDescription()
        );

        vo.setCoverUrl(
                travel.getCoverUrl()
        );

        vo.setBackgroundUrl(
                travel.getBackgroundUrl()
        );

        vo.setStartDate(
                travel.getStartDate()
        );

        vo.setEndDate(
                travel.getEndDate()
        );

        vo.setVisibility(
                travel.getVisibility()
        );

        vo.setIsPublished(
                travel.getIsPublished()
        );

        vo.setViewCount(
                travel.getViewCount()
        );

        vo.setLikeCount(
                travel.getLikeCount()
        );

        vo.setCreatedAt(
                travel.getCreatedAt()
        );

        vo.setUpdatedAt(
                travel.getUpdatedAt()
        );

        return vo;
    }
}
