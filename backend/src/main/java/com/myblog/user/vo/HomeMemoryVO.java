package com.myblog.user.vo;

/**
 * 当前 JWT 用户的一段旅行主题：一段旅行只有一张主封面和一张背景画面。
 * 这两个照片 ID 均属于此 travelId，二进制文件仍通过 JWT 图片接口读取。
 */
public class HomeMemoryVO {
    private Long travelId;
    private Long coverMediaId;
    private Long backgroundMediaId;
    private String coverUrl;
    private String backgroundUrl;
    private String title;
    private String subtitle;
    private String caption;
    private String author;
    private String visibility;

    public Long getTravelId() { return travelId; }
    public void setTravelId(Long value) { travelId = value; }
    public Long getCoverMediaId() { return coverMediaId; }
    public void setCoverMediaId(Long value) { coverMediaId = value; }
    public Long getBackgroundMediaId() { return backgroundMediaId; }
    public void setBackgroundMediaId(Long value) { backgroundMediaId = value; }
    public String getCoverUrl() { return coverUrl; }
    public void setCoverUrl(String value) { coverUrl = value; }
    public String getBackgroundUrl() { return backgroundUrl; }
    public void setBackgroundUrl(String value) { backgroundUrl = value; }
    public String getTitle() { return title; }
    public void setTitle(String value) { title = value; }
    public String getSubtitle() { return subtitle; }
    public void setSubtitle(String value) { subtitle = value; }
    public String getCaption() { return caption; }
    public void setCaption(String value) { caption = value; }
    public String getAuthor() { return author; }
    public void setAuthor(String value) { author = value; }
    public String getVisibility() { return visibility; }
    public void setVisibility(String value) { visibility = value; }
}
