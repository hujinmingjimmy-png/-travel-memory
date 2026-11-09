package com.myblog.user.vo;

import java.time.LocalDate;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * 【统一故事记忆点】手账与真实地图的故事字段都从 travel_point 读取。
 * REAL 使用高德 GCJ-02 longitude/latitude；CUSTOM 使用 xRatio/yRatio。
 * 只返回当前请求有权限读取的旅行记忆点，不包含其他账号的数据。
 */
public class TravelStoryPointVO {
    private Long id;
    private Long travelId;
    private String pointType;
    private Long mediaId;
    private String title;
    private String subtitle;
    private String content;
    private String locationName;
    private LocalDate travelDate;
    private Integer sortOrder;
    private Double xRatio;
    private Double yRatio;
    private Double longitude;
    private Double latitude;

    public Long getId() { return id; }
    public void setId(Long v) { id = v; }
    public Long getTravelId() { return travelId; }
    public void setTravelId(Long v) { travelId = v; }
    public String getPointType() { return pointType; }
    public void setPointType(String v) { pointType = v; }
    public Long getMediaId() { return mediaId; }
    public void setMediaId(Long v) { mediaId = v; }
    public String getTitle() { return title; }
    public void setTitle(String v) { title = v; }
    public String getSubtitle() { return subtitle; }
    public void setSubtitle(String v) { subtitle = v; }
    public String getContent() { return content; }
    public void setContent(String v) { content = v; }
    public String getLocationName() { return locationName; }
    public void setLocationName(String v) { locationName = v; }
    public LocalDate getTravelDate() { return travelDate; }
    public void setTravelDate(LocalDate v) { travelDate = v; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer v) { sortOrder = v; }
    // ★★★★★ 明确使用小写 xRatio/yRatio；避免 JavaBeans 将它们解析为 XRatio/YRatio。
    @JsonProperty("xRatio")
    public Double getXRatio() { return xRatio; }
    @JsonProperty("xRatio")
    public void setXRatio(Double v) { xRatio = v; }
    @JsonProperty("yRatio")
    public Double getYRatio() { return yRatio; }
    @JsonProperty("yRatio")
    public void setYRatio(Double v) { yRatio = v; }
    public Double getLongitude() { return longitude; }
    public void setLongitude(Double v) { longitude = v; }
    public Double getLatitude() { return latitude; }
    public void setLatitude(Double v) { latitude = v; }
}
