package com.myblog.user.dto;

/** 地图背景选择：mediaId=null 表示清除地图背景。 */
public class TravelMapBackgroundRequest {
    private Long mediaId;
    public Long getMediaId() { return mediaId; }
    public void setMediaId(Long mediaId) { this.mediaId = mediaId; }
}
