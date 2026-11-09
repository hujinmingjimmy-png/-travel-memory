package com.myblog.user.vo;

/**
 * 用户登录成功后的返回对象。
 *
 * 用途：
 * 登录成功后，把前端真正需要的用户信息和 JWT Token 返回出去。
 *
 * 注意：
 * 这里绝对不返回 password。
 */
public class LoginVO {

    /**
     * 用户 ID。
     */
    private Long id;

    /**
     * 用户名。
     */
    private String username;

    /**
     * 页面展示昵称。
     */
    private String nickname;

    /**
     * 用户头像地址。
     */
    private String avatar;

    /**
     * JWT 登录凭证。
     *
     * Vue 后面会保存这个 Token，
     * 并在请求受保护接口时放进：
     *
     * Authorization: Bearer <token>
     */
    private String token;


    /**
     * 无参构造方法。
     */
    public LoginVO() {
    }


    // =========================================================
    // Getter / Setter
    //
    // 这里显式写出来，避免当前编译阶段因为任何注解处理问题
    // 导致 AuthServiceImpl 找不到 setId() / setToken() 等方法。
    // =========================================================

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


    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }
}
