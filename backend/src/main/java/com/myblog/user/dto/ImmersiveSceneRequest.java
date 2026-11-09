package com.myblog.user.dto;

public class ImmersiveSceneRequest {

    private Integer sortOrder;
    private Double cameraScale;
    private Integer moveDuration;
    private Integer stayDuration;
    private String easing;

    public Integer getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(Integer sortOrder) {
        this.sortOrder = sortOrder;
    }

    public Double getCameraScale() {
        return cameraScale;
    }

    public void setCameraScale(Double cameraScale) {
        this.cameraScale = cameraScale;
    }

    public Integer getMoveDuration() {
        return moveDuration;
    }

    public void setMoveDuration(Integer moveDuration) {
        this.moveDuration = moveDuration;
    }

    public Integer getStayDuration() {
        return stayDuration;
    }

    public void setStayDuration(Integer stayDuration) {
        this.stayDuration = stayDuration;
    }

    public String getEasing() {
        return easing;
    }

    public void setEasing(String easing) {
        this.easing = easing;
    }
}
