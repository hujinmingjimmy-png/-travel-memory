package com.myblog.user.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.time.LocalDateTime;

/**
 * 用户实体类
 *
 * 用途：
 * 对应数据库中的 user 表。
 *
 * 数据库中的一行用户数据，
 * 在 Java 中就表示成一个 User 对象。
 */
@TableName("user")
public class User {

    /**
     * 用户主键
     *
     * IdType.AUTO：
     * 表示数据库自动生成 ID。
     */
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    /**
     * 登录用户名
     */
    private String username;

    /**
     * 加密后的密码
     */
    private String password;

    /**
     * 用户昵称
     */
    private String nickname;

    /**
     * 用户头像地址
     */
    private String avatar;

    /**
     * 用户状态
     *
     * 1 = 正常
     * 0 = 禁用
     */
    private Integer status;

    /**
     * 创建时间
     *
     * Java 使用 createdAt，
     * 数据库使用 created_at。
     */
    @TableField("created_at")
    private LocalDateTime createdAt;

    /**
     * 修改时间
     */
    @TableField("updated_at")
    private LocalDateTime updatedAt;


    // =====================================================
    // Getter / Setter
    //
    // 用途：
    // 让其他 Java 类可以读取和修改 User 对象中的数据。
    // =====================================================

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }


    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }


    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }


    public String getNickname() {
        return nickname;
    }

    public void setNickname(String nickname) {
        this.nickname = nickname;
    }


    public String getAvatar() {
        return avatar;
    }

    public void setAvatar(String avatar) {
        this.avatar = avatar;
    }


    public Integer getStatus() {
        return status;
    }

    public void setStatus(Integer status) {
        this.status = status;
    }


    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }


    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}