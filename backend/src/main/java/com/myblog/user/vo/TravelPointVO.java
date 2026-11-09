package com.myblog.user.vo;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** 返回给 Vue 的地图记忆点。 */
public class TravelPointVO {
    private Long id;
    private Long travelId;
    private Long mediaId;
    private String title;
    private String subtitle;
    private String content;
    private String locationName;
    private LocalDate travelDate;
    private Double xRatio;
    private Double yRatio;
    private Integer sortOrder;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getTravelId() { return travelId; }
    public void setTravelId(Long travelId) { this.travelId = travelId; }
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
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
