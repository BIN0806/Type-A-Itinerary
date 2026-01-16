import axios, { AxiosInstance, AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = __DEV__ 
  ? 'http://10.0.0.175:8000/v1'  // Host machine IP (not localhost - simulator can't reach localhost)
  : 'https://api.plana.app/v1';

class ApiService {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    // Log configuration for debugging
    console.log('🌐 API Service initialized');
    console.log('📡 Base URL:', API_BASE_URL);
    console.log('🔧 __DEV__:', __DEV__);
    
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
    console.log('🔐 Attempting registration...');
    console.log('📧 Email:', email);
    console.log('🌐 URL:', this.client.defaults.baseURL + '/auth/register');
    
    try {
      const response = await this.client.post('/auth/register', { email, password });
      console.log('✅ Registration successful:', response.status);
      return response.data;
    } catch (error: any) {
      console.error('❌ Registration failed');
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      console.error('Error code:', error.code);
      console.error('Response status:', error.response?.status);
      console.error('Response data:', error.response?.data);
      throw error;
    }
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
    console.log('📤 API: uploadImages called');
    const formData = images instanceof FormData ? images : new FormData();
    
    if (!(images instanceof FormData)) {
      images.forEach((image, index) => {
        formData.append('files', image);
      });
    }

    try {
      console.log('🌐 Posting to /trip/upload...');
      // 45 second timeout - optimized backend processes images in parallel
      // Any longer and the app feels unresponsive
      const response = await this.client.post('/trip/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 45000, // 45 seconds max
      });
      console.log('✅ Upload response:', response.status, response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Upload API error');
      console.error('Status:', error.response?.status);
      console.error('Data:', error.response?.data);
      throw error;
    }
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
