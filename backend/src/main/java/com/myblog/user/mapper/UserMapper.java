package com.myblog.user.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.myblog.user.entity.User;
import org.apache.ibatis.annotations.Mapper;

/**
 * 用户数据库操作接口
 *
 * 用途：
 * 这个接口负责操作 MySQL 中的 user 表。
 *
 * 例如以后我们需要：
 *
 * 1. 查询用户
 * 2. 新增用户
 * 3. 修改用户
 * 4. 删除用户
 *
 * 都可以通过 UserMapper 完成。
 *
 * UserMapper 继承 BaseMapper<User> 后，
 * MyBatis-Plus 会自动帮我们提供大量常用的数据库操作方法。
 */
@Mapper
public interface UserMapper extends BaseMapper<User> {

}