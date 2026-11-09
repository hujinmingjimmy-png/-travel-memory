package com.myblog.user.vo;

import java.util.List;

/** 旅行地图整体返回值。背景与电影式首页的主题背景互不影响。 */
public class TravelMapVO {
    private Long travelId;
    private Long mapBackgroundMediaId;
    private List<TravelPointVO> points;

    public Long getTravelId() { return travelId; }
    public void setTravelId(Long travelId) { this.travelId = travelId; }
    public Long getMapBackgroundMediaId() { return mapBackgroundMediaId; }
    public void setMapBackgroundMediaId(Long id) { this.mapBackgroundMediaId = id; }
    public List<TravelPointVO> getPoints() { return points; }
    public void setPoints(List<TravelPointVO> points) { this.points = points; }
}
