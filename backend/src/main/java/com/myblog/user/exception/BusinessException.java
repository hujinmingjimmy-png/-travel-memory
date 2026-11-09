package com.myblog.user.exception;

/**
 * 业务异常。
 *
 * 用途：
 * 表示程序本身没有崩溃，只是当前业务操作无法完成。
 *
 * 例如：
 * 1. 用户名已经存在
 * 2. 用户名或密码错误
 * 3. 账号已被禁用
 * 4. 后续旅行不存在、没有权限修改旅行等
 */
public class BusinessException extends RuntimeException {

    /**
     * 业务状态码。
     *
     * 当前项目中：
     * 400 = 普通业务错误
     */
    private final Integer code;

    /**
     * 创建普通业务异常。
     *
     * 默认业务状态码为 400。
     *
     * @param message 返回给前端的错误提示
     */
    public BusinessException(String message) {
        super(message);
        this.code = 400;
    }

    /**
     * 创建指定状态码的业务异常。
     *
     * @param code    业务状态码
     * @param message 返回给前端的错误提示
     */
    public BusinessException(Integer code, String message) {
        super(message);
        this.code = code;
    }

    /**
     * 获取业务状态码。
     */
    public Integer getCode() {
        return code;
    }
}
