package com.myblog.user.dto;

/**
 * 用户登录请求对象
 *
 * 用途：
 * 接收前端登录页面发送过来的：
 *
 * username
 * password
 *
 * 例如：
 *
 * {
 *   "username": "jack",
 *   "password": "123456"
 * }
 */
public class LoginRequest {

    /**
     * 登录用户名
     */
    private String username;

    /**
     * 登录密码
     */
    private String password;


    /**
     * 无参构造方法
     *
     * Spring Boot 把 JSON 转成 Java 对象时会用到。
     */
    public LoginRequest() {
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
}