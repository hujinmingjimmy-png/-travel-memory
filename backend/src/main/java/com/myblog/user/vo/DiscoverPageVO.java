package com.myblog.user.vo;

import java.util.List;

/** 公开内容分页响应，前端通过 hasMore 决定是否显示“加载更多”。 */
public class DiscoverPageVO {
    private List<DiscoverTravelVO> items;
    private int page;
    private int size;
    private boolean hasMore;

    public DiscoverPageVO(List<DiscoverTravelVO> items, int page, int size, boolean hasMore) {
        this.items = items;
        this.page = page;
        this.size = size;
        this.hasMore = hasMore;
    }

    public List<DiscoverTravelVO> getItems() { return items; }
    public void setItems(List<DiscoverTravelVO> value) { items = value; }
    public int getPage() { return page; }
    public void setPage(int value) { page = value; }
    public int getSize() { return size; }
    public void setSize(int value) { size = value; }
    public boolean isHasMore() { return hasMore; }
    public void setHasMore(boolean value) { hasMore = value; }
}
