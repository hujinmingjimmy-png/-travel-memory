package com.myblog.user.dto;

/**
 * 手账地图场景设置。
 * IMAGE = 用户上传图片作为手账地图背景；
 * CARTOON_REAL = 从真实地图选取范围，再以前端 2.5D 卡通方式展示。
 */
public class TravelMapSceneRequest {
    private String sourceType;
    private Double centerLng;
    private Double centerLat;
    private Double zoom;
    private Double pitch;
    private Double rotation;
    private String cartoonStyle;
    private Double southWestLng;
    private Double southWestLat;
    private Double northEastLng;
    private Double northEastLat;

    public String getSourceType() { return sourceType; }
    public void setSourceType(String sourceType) { this.sourceType = sourceType; }
    public Double getCenterLng() { return centerLng; }
    public void setCenterLng(Double centerLng) { this.centerLng = centerLng; }
    public Double getCenterLat() { return centerLat; }
    public void setCenterLat(Double centerLat) { this.centerLat = centerLat; }
    public Double getZoom() { return zoom; }
    public void setZoom(Double zoom) { this.zoom = zoom; }
    public Double getPitch() { return pitch; }
    public void setPitch(Double pitch) { this.pitch = pitch; }
    public Double getRotation() { return rotation; }
    public void setRotation(Double rotation) { this.rotation = rotation; }
    public String getCartoonStyle() { return cartoonStyle; }
    public void setCartoonStyle(String cartoonStyle) { this.cartoonStyle = cartoonStyle; }
    public Double getSouthWestLng() { return southWestLng; }
    public void setSouthWestLng(Double southWestLng) { this.southWestLng = southWestLng; }
    public Double getSouthWestLat() { return southWestLat; }
    public void setSouthWestLat(Double southWestLat) { this.southWestLat = southWestLat; }
    public Double getNorthEastLng() { return northEastLng; }
    public void setNorthEastLng(Double northEastLng) { this.northEastLng = northEastLng; }
    public Double getNorthEastLat() { return northEastLat; }
    public void setNorthEastLat(Double northEastLat) { this.northEastLat = northEastLat; }
}
