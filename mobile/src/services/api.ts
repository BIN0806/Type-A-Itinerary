import axios, { AxiosInstance, AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = __DEV__ 
  ? 'http://10.43.218.160:8000/v1' 
  : 'https://api.v2v.app/v1';

class ApiService {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Add request interceptor to include auth token
    this.client.interceptors.request.use(
      async (config) => {
        if (!this.token) {
          this.token = await AsyncStorage.getItem('auth_token');
        }
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Clear token on unauthorized
          await this.clearToken();
        }
        return Promise.reject(error);
      }
    );
  }

  async setToken(token: string) {
    this.token = token;
    await AsyncStorage.setItem('auth_token', token);
  }

  async clearToken() {
    this.token = null;
    await AsyncStorage.removeItem('auth_token');
  }

  // Auth APIs
  async register(email: string, password: string) {
    const response = await this.client.post('/auth/register', { email, password });
    return response.data;
  }

  async login(email: string, password: string) {
    const response = await this.client.post('/auth/login', { email, password });
    const { access_token } = response.data;
    await this.setToken(access_token);
    return response.data;
  }

  async getMe() {
    const response = await this.client.get('/auth/me');
    return response.data;
  }

  // Trip APIs
  async uploadImages(images: File[] | FormData) {
    const formData = images instanceof FormData ? images : new FormData();
    
    if (!(images instanceof FormData)) {
      images.forEach((image, index) => {
        formData.append('files', image);
      });
    }

    const response = await this.client.post('/trip/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async getJobStatus(jobId: string) {
    const response = await this.client.get(`/trip/${jobId}/status`);
    return response.data;
  }

  async getCandidates(jobId: string) {
    const response = await this.client.get(`/trip/${jobId}/candidates`);
    return response.data;
  }

  async confirmWaypoints(
    jobId: string,
    waypoints: any[],
    tripName: string = 'My Trip'
  ) {
    const response = await this.client.post(
      `/trip/${jobId}/confirm?trip_name=${encodeURIComponent(tripName)}`,
      waypoints
    );
    return response.data;
  }

  async optimizeTrip(tripId: string, constraints: any) {
    const response = await this.client.post('/trip/optimize', {
      trip_id: tripId,
      constraints,
    });
    return response.data;
  }

  async getMapsLink(tripId: string) {
    const response = await this.client.get(`/maps/link/${tripId}`);
    return response.data;
  }

  async listTrips() {
    const response = await this.client.get('/trips');
    return response.data;
  }

  async getTrip(tripId: string) {
    const response = await this.client.get(`/trip/${tripId}`);
    return response.data;
  }
}

export const apiService = new ApiService();
