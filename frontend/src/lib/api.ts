import axios from "axios";

export const api = axios.create({
  baseURL: "",
  withCredentials: true   // send httpOnly auth cookies with every request
});
