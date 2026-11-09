package com.myblog.user.common;

/**
 * 后端统一返回结果。
 *
 * 显式声明 getter/setter，避免 Lombok 注解处理未生效时
 * Jackson 无法序列化 ApiResult，导致接口可能返回 HTTP 406。
 */
public class ApiResult<T> {

    private Integer code;
    private String message;
    private T data;

    public ApiResult() {
    }

    public ApiResult(Integer code, String message, T data) {
        this.code = code;
        this.message = message;
        this.data = data;
    }

    public Integer getCode() {
        return code;
    }

    public void setCode(Integer code) {
        this.code = code;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public T getData() {
        return data;
    }

    public void setData(T data) {
        this.data = data;
    }

    public static <T> ApiResult<T> success(T data) {
        return new ApiResult<T>(200, "操作成功", data);
    }

    public static <T> ApiResult<T> success(String message, T data) {
        return new ApiResult<T>(200, message, data);
    }

    public static <T> ApiResult<T> fail(Integer code, String message) {
        return new ApiResult<T>(code, message, null);
    }
}
