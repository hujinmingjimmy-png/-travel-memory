package com.myblog.user.dto;

/** 用户在旅行详情页选择两张不同用途的照片。允许同一张照片兼任两种用途。 */
public class ThemeArtRequest {
    private Long coverMediaId;
    private Long backgroundMediaId;
    public Long getCoverMediaId() { return coverMediaId; }
    public void setCoverMediaId(Long id) { coverMediaId = id; }
    public Long getBackgroundMediaId() { return backgroundMediaId; }
    public void setBackgroundMediaId(Long id) { backgroundMediaId = id; }
}
