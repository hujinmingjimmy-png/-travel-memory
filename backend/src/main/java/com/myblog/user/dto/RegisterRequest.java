package com.myblog.user.dto;

/**
 * 用户注册请求对象
 *
 * 用途：
 * 接收前端注册页面发送过来的数据。
 *
 * 例如前端发送：
 *
 * {
 *   "username": "jack",
 *   "password": "123456",
 *   "nickname": "杰哥"
 * }
 */
public class RegisterRequest {

    /**
     * 登录用户名
     */
    private String username;

    /**
     * 登录密码
     */
    private String password;

    /**
     * 用户昵称
     */
    private String nickname;


    /**
     * 无参构造方法
     *
     * Spring Boot 把 JSON 转换成 Java 对象时会使用。
     */
    public RegisterRequest() {
    }


    /**
     * 获取用户名
     */
    public String getUsername() {
        return username;
    }


    /**
     * 设置用户名
     */
    public void setUsername(String username) {
        this.username = username;
    }


    /**
     * 获取密码
     */
    public String getPassword() {
        return password;
    }


    /**
     * 设置密码
     */
    public void setPassword(String password) {
        this.password = password;
    }


    /**
     * 获取昵称
     */
    public String getNickname() {
        return nickname;
    }


    /**
     * 设置昵称
     */
    public void setNickname(String nickname) {
        this.nickname = nickname;
    }
}