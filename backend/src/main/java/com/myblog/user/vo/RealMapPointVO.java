package com.myblog.user.vo;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** 真实地图回传记忆点；前端将经纬度映射成 Marker。 */
public class RealMapPointVO {
    private Long id;
    private Long travelId;
    private Long mediaId;
    private String title;
    private String subtitle;
    private String content;
    private String locationName;
    private LocalDate travelDate;
    private Double longitude;
    private Double latitude;
    private Integer sortOrder;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long value) { id = value; }
    public Long getTravelId() { return travelId; }
    public void setTravelId(Long value) { travelId = value; }
    public Long getMediaId() { return mediaId; }
    public void setMediaId(Long value) { mediaId = value; }
    public String getTitle() { return title; }
    public void setTitle(String value) { title = value; }
    public String getSubtitle() { return subtitle; }
    public void setSubtitle(String value) { subtitle = value; }
    public String getContent() { return content; }
    public void setContent(String value) { content = value; }
    public String getLocationName() { return locationName; }
    public void setLocationName(String value) { locationName = value; }
    public LocalDate getTravelDate() { return travelDate; }
    public void setTravelDate(LocalDate value) { travelDate = value; }
    public Double getLongitude() { return longitude; }
    public void setLongitude(Double value) { longitude = value; }
    public Double getLatitude() { return latitude; }
    public void setLatitude(Double value) { latitude = value; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer value) { sortOrder = value; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime value) { createdAt = value; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime value) { updatedAt = value; }
}
