// useAdminStore.js
import { create } from 'zustand';
import axios from 'axios';

const useAdminStore = create((set) => ({
  users: [],
  currentPage: 1,
  totalPages: 0,
  totalUsers: 0,
  loading: false,
  error: null,
  
  fetchUsers: async (page = 1) => {
    set({ loading: true, error: null });
    try {
      const response = await axios.get(`http://localhost:3001/api/admin/users?page=${page}&limit=10`);
    //   console.log(response.data.data.users);
      
      set({
        users: response.data.data.users,
        currentPage: response.data.data.currentPage,
        totalPages: response.data.data.totalPages,
        totalUsers: response.data.data.totalUsers,
        loading: false
      });
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to fetch users', 
        loading: false 
      });
    }
  },

  deleteUser: async (userId) => {
    try {
      await axios.delete(`http://localhost:3001/api/admin/users/${userId}`);
      set((state) => ({
        users: state.users.filter(user => user._id !== userId)
      }));
    } catch (error) {
      set({ error: error.response?.data?.message || 'Failed to delete user' });
    }
  }
}));

export default useAdminStore;