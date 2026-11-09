package com.myblog.user.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.myblog.user.entity.TravelProject;
import org.apache.ibatis.annotations.Mapper;

/**
 * travel_project 数据库访问层。
 *
 * BaseMapper 已经提供：
 *
 * insert
 * selectById
 * selectList
 * updateById
 * deleteById
 * ...
 */
@Mapper
public interface TravelProjectMapper
        extends BaseMapper<TravelProject> {
}
