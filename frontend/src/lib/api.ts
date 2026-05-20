import axios from "axios";

export const api = axios.create({
  baseURL: "",
  withCredentials: true   // send httpOnly auth cookies with every request
});

// Global 401 interceptor — redirect to login whenever a session expires
// or a token is invalid, instead of showing "Unauthorized" inside forms.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      // Don't redirect if we're already on the auth/recovery pages
      const path = window.location.pathname;
      if (path !== "/setup" && path !== "/recovery") {
        window.location.href = "/setup";
      }
    }
    return Promise.reject(err);
  }
);
