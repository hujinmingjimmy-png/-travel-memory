package com.myblog.user.dto;

import java.time.LocalDate;

/**
 * 真实地图记忆点请求。所属旅行在 URL，所属账号由 JWT 得出。
 * 经度纬度使用高德 GCJ-02 坐标，不接收前端 userId。
 */
public class RealMapPointRequest {
    private Long mediaId;
    private String title;
    private String subtitle;
    private String content;
    private String locationName;
    private LocalDate travelDate;
    private Double longitude;
    private Double latitude;
    private Integer sortOrder;

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
}
