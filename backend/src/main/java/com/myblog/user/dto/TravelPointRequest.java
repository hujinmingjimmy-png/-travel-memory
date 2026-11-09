package com.myblog.user.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDate;

/**
 * 地图记忆点提交参数。只接收内容和坐标；所属旅行由 URL 确定，
 * 所属用户由后端 JWT 确定，绝不允许前端指定 userId。
 * 不使用 Lombok，避免之前的 getter/setter 编译问题。
 */
public class TravelPointRequest {
    private Long mediaId;
    private String title;
    private String subtitle;
    private String content;
    private String locationName;
    private LocalDate travelDate;
    private Double xRatio;
    private Double yRatio;
    private Integer sortOrder;

    public Long getMediaId() { return mediaId; }
    public void setMediaId(Long mediaId) { this.mediaId = mediaId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getSubtitle() { return subtitle; }
    public void setSubtitle(String subtitle) { this.subtitle = subtitle; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getLocationName() { return locationName; }
    public void setLocationName(String locationName) { this.locationName = locationName; }
    public LocalDate getTravelDate() { return travelDate; }
    public void setTravelDate(LocalDate travelDate) { this.travelDate = travelDate; }
    @JsonProperty("xRatio")
    public Double getXRatio() { return xRatio; }
    @JsonProperty("xRatio")
    public void setXRatio(Double xRatio) { this.xRatio = xRatio; }
    @JsonProperty("yRatio")
    public Double getYRatio() { return yRatio; }
    @JsonProperty("yRatio")
    public void setYRatio(Double yRatio) { this.yRatio = yRatio; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
}
