import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { apiService } from '../../services/api';

type UploadScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Upload'>;
};

export const UploadScreen: React.FC<UploadScreenProps> = ({ navigation }) => {
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: number]: boolean }>({});

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please grant camera roll permissions to upload photos'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 50,
    });

    if (!result.canceled && result.assets) {
      const imageUris = result.assets.map(asset => asset.uri);
      setSelectedImages(prev => [...prev, ...imageUris]);
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const uploadImages = async () => {
    if (selectedImages.length === 0) {
      Alert.alert('No Images', 'Please select at least one image');
      return;
    }

    console.log('📤 Starting image upload...');
    console.log(`📊 Image count: ${selectedImages.length}`);
    setIsUploading(true);

    try {
      // Create FormData
      const formData = new FormData();
      
      selectedImages.forEach((uri, index) => {
        const filename = uri.split('/').pop() || `image_${index}.jpg`;
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';

        console.log(`📷 Adding image ${index + 1}:`, filename);
        formData.append('files', {
          uri,
          name: filename,
          type,
        } as any);

        setUploadProgress(prev => ({ ...prev, [index]: true }));
      });

      // Upload to backend
      console.log('🚀 Uploading to backend...');
      const response = await apiService.uploadImages(formData);
      const { job_id } = response;

      console.log('✅ Upload successful! Job ID:', job_id);
      Alert.alert(
        'Upload Successful',
        'Your images are being analyzed. This may take a moment.',
        [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Confirmation', { jobId: job_id })
          }
        ]
      );
    } catch (error: any) {
      console.error('❌ Upload failed');
      console.error('Error details:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });

      // Better error messages based on error type
      let errorMessage = 'Could not upload images';
      
      if (error.response?.status === 429 || 
          error.response?.data?.detail?.includes('quota') ||
          error.response?.data?.detail?.includes('OpenAI')) {
        errorMessage = 'API quota exceeded. Please check your OpenAI API credits at platform.openai.com/account/billing';
      } else if (error.response?.status === 401) {
        errorMessage = 'Authentication error. Please try logging in again.';
      } else if (error.response?.status === 500) {
        errorMessage = 'Server error. Please try again later or check backend logs.';
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        errorMessage = 'Cannot connect to server. Make sure Docker is running.';
      } else if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      }

      Alert.alert('Upload Failed', errorMessage);
    } finally {
      setIsUploading(false);
      setUploadProgress({});
      console.log('🏁 Upload flow complete');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Upload Travel Photos</Text>
        <Text style={styles.subtitle}>
          Select screenshots from TikTok, Instagram, or your Camera Roll
        </Text>
      </View>

      <ScrollView
        style={styles.imageGrid}
        contentContainerStyle={styles.imageGridContent}
      >
        {selectedImages.map((uri, index) => (
          <View key={index} style={styles.imageContainer}>
            <Image source={{ uri }} style={styles.image} />
            {uploadProgress[index] && (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => removeImage(index)}
              disabled={isUploading}
            >
              <Text style={styles.removeButtonText}>×</Text>
            </TouchableOpacity>
          </View>
        ))}

        {selectedImages.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No images selected</Text>
            <Text style={styles.emptyStateSubtext}>
              Tap "Add Photos" to get started
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={pickImages}
          disabled={isUploading}
        >
          <Text style={styles.buttonSecondaryText}>
            Add Photos ({selectedImages.length}/50)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            styles.buttonPrimary,
            (selectedImages.length === 0 || isUploading) && styles.buttonDisabled
          ]}
          onPress={uploadImages}
          disabled={isUploading}
          accessibilityState={{ disabled: selectedImages.length === 0 || isUploading }}
        >
          {isUploading ? (
            <ActivityIndicator testID="loading-indicator" color="#fff" />
          ) : (
            <Text style={styles.buttonPrimaryText}>
              Analyze Locations
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    padding: 24,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  imageGrid: {
    flex: 1,
  },
  imageGridContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
  },
  imageContainer: {
    width: '30%',
    aspectRatio: 1,
    margin: '1.66%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  button: {
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 8,
  },
  buttonPrimary: {
    backgroundColor: '#4F46E5',
  },
  buttonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#4F46E5',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSecondaryText: {
    color: '#4F46E5',
    fontSize: 16,
    fontWeight: '600',
  },
});
