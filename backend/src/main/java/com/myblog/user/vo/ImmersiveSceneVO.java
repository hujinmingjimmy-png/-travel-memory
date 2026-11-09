package com.myblog.user.vo;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDate;

public class ImmersiveSceneVO {

    private Long sceneId;
    private Long pointId;
    private Long travelId;
    private String pointType;
    private Long mediaId;

    private String title;
    private String subtitle;
    private String content;
    private String locationName;
    private LocalDate travelDate;

    private Integer sortOrder;
    private Double cameraScale;
    private Integer moveDuration;
    private Integer stayDuration;
    private String easing;

    private Double xRatio;
    private Double yRatio;
    private Double longitude;
    private Double latitude;

    public Long getSceneId() { return sceneId; }
    public void setSceneId(Long v) { sceneId = v; }

    public Long getPointId() { return pointId; }
    public void setPointId(Long v) { pointId = v; }

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

    public Double getCameraScale() { return cameraScale; }
    public void setCameraScale(Double v) { cameraScale = v; }

    public Integer getMoveDuration() { return moveDuration; }
    public void setMoveDuration(Integer v) { moveDuration = v; }

    public Integer getStayDuration() { return stayDuration; }
    public void setStayDuration(Integer v) { stayDuration = v; }

    public String getEasing() { return easing; }
    public void setEasing(String v) { easing = v; }

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
