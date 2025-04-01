import React, { useEffect } from "react";
import { FiSearch, FiPlus, FiUsers } from "react-icons/fi";
import useAdminStore from "../store/AdminStore";
import logo from "../assets/logo.png";

const AdminPanel = () => {
  const {
    filteredUsers,
    currentPage,
    totalPages,
    totalUsers,
    loading,
    error,
    searchQuery,
    fetchUsers,
    deleteUser,
    setSearchQuery,
  } = useAdminStore();

  const users = useAdminStore((state) => state.users);
  //   console.log(users);

  useEffect(() => {
    console.log("Fetching users for page:", currentPage);
    fetchUsers(currentPage);
  }, [currentPage, fetchUsers]);

  useEffect(() => {
    console.log("Current filteredUsers:", filteredUsers);
  }, [filteredUsers]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      console.log("Changing page to:", newPage);
      fetchUsers(newPage);
    }
  };

  const handleDelete = async (userId) => {
    if (window.confirm("Are you sure you want to delete this user?")) {
      console.log("Deleting user with ID:", userId);
      await deleteUser(userId);
    }
  };

  const handleSearch = (e) => {
    console.log("Search query:", e.target.value);
    setSearchQuery(e.target.value);
  };

  if (loading)
    return <div className="text-center py-5 text-lg">Loading...</div>;
  if (error)
    return <div className="text-center py-5 text-lg text-red-500">{error}</div>;

  return (
    <div className="flex h-screen bg-gray-100">
      <div className="w-16 bg-black text-white flex flex-col items-center py-4">
        <div className="mb-8">
          <img src={logo} alt="Logo" className="w-10 h-10" />
        </div>
        <nav className="flex-1 flex flex-col space-y-4">
          <button className="p-2 bg-gray-500 rounded">
            <FiUsers className="w-6 h-6" />
          </button>
        </nav>
      </div>

      <div className="flex-1 p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-gray-800">Admin Panel</h1>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <table className="min-w-full">
            <thead>
              <tr className="text-left text-gray-600">
                <th className="py-3 px-4 border-b">ID</th>
                <th className="py-3 px-4 border-b">FullName</th>
                <th className="py-3 px-4 border-b">Email</th>
                <th className="py-3 px-4 border-b">Delete</th>
              </tr>
            </thead>
            <tbody>
              {Array.isArray(users) && users.length > 0 ? (
                users.map((user, index) => (
                  <tr key={users._id} className="border-b">
                    <td className="py-3 px-4">{index + 1}</td>
                    <td className="py-3 px-4">{user.firstName}</td>
                    <td className="py-3 px-4">{user.emailId}</td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleDelete(user._id)}
                        className="bg-red-500 hover:bg-red-600 text-white font-medium py-1 px-3 rounded"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan="6"
                    className="py-3 px-4 text-center text-gray-500"
                  >
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-between items-center">
          <div className="text-gray-600">
            Showing {Array.isArray(filteredUsers) ? filteredUsers.length : 0} of{" "}
            {totalUsers} users
          </div>
          <div className="flex space-x-2">
            <button
              disabled={currentPage === 1}
              onClick={() => handlePageChange(currentPage - 1)}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-1 px-3 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="py-1 px-3">
              {currentPage} of {totalPages}
            </span>
            <button
              disabled={currentPage === totalPages}
              onClick={() => handlePageChange(currentPage + 1)}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-1 px-3 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
