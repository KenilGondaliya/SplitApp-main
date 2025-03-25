import { Container, Box, Typography } from "@mui/material";
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getGroupDetailsService } from "../../../services/groupServices";
import AlertBanner from "../../AlertBanner";
import Loading from "../../loading";
import "chart.js/auto";
import { Bar } from "react-chartjs-2";
import useResponsive from "../../../theme/hooks/useResponsive";

const UserBalanceChart = () => {
  const params = useParams();
  const mdUp = useResponsive("up", "md");
  const [loading, setLoading] = useState(false);
  const [graphData, setGraphData] = useState([]);
  const [graphLabel, setGraphLabel] = useState([]);
  const [alert, setAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState();

  const data = {
    labels: graphLabel,
    datasets: [
      {
        label: "User Balance",
        data: graphData,
        backgroundColor: "rgba(255, 99, 132, 0.5)",
        borderColor: "rgba(255, 99, 132, 1)",
      },
    ],
  };

  const options = {
    scales: {
      x: {
        ticks: {
          display: mdUp,
        },
      },
    },
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
    },
  };

  const fetchGroupDetails = async () => {
    setLoading(true);
    const groupIdJson = { id: params.groupId };
    try {
      const response_group = await getGroupDetailsService(
        groupIdJson,
        setAlert,
        setAlertMessage
      );
      const splitData = response_group?.data?.group?.split || [];
      console.log("UserBalanceChart - Fetched split:", splitData);

      if (!splitData.length || !splitData[0]) {
        console.warn("UserBalanceChart - No split data available");
        setGraphData([]);
        setGraphLabel([]);
        setLoading(false);
        return;
      }

      const firstSplit = splitData[0]; // Expecting an object like { "email": amount }
      const splitEntries = Object.entries(firstSplit || {});
      console.log("UserBalanceChart - Split entries:", splitEntries);

      const newGraphData = [];
      const newGraphLabel = [];
      splitEntries.forEach(([email, amount]) => {
        if (amount < 0) {
          newGraphData.push(Math.abs(amount));
          newGraphLabel.push(email.split("@")[0]); // Use username part
        }
      });

      console.log("UserBalanceChart - Processed data:", {
        newGraphData,
        newGraphLabel,
      });
      setGraphData(newGraphData);
      setGraphLabel(newGraphLabel);
    } catch (error) {
      console.error("UserBalanceChart - Fetch error:", error);
      setGraphData([]);
      setGraphLabel([]);
      setAlert(true);
      setAlertMessage("Failed to load balance chart data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroupDetails();
  }, [params.groupId]); // Re-fetch if groupId changes

  return (
    <>
      {loading ? (
        <Loading />
      ) : (
        <Container sx={{ my: 6 }}>
          <AlertBanner
            showAlert={alert}
            alertMessage={alertMessage}
            severity={"error"}
          />
          {graphData.length > 0 ? (
            <Box height={350} my={2}>
              <Bar data={data} options={options} />
            </Box>
          ) : (
            <Typography>No balance data to display</Typography>
          )}
        </Container>
      )}
    </>
  );
};

export default UserBalanceChart;
