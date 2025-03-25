import { Grid, Typography } from "@mui/material";
import { Box } from "@mui/system";
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getGroupSettleService } from "../../../services/groupServices";
import useResponsive from "../../../theme/hooks/useResponsive";
import AlertBanner from "../../AlertBanner";
import Iconify from "../../Iconify";
import Loading from "../../loading";
import SettlementCard from "./settlementCard";
import UserBalanceChart from "./userBalanceChart";

export const GroupSettlements = ({ currencyType }) => {
  const params = useParams();
  const [noSettle, setNoSettle] = useState(true);
  const [alert, setAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [groupSettlement, setGroupSettlement] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const mdUp = useResponsive("up", "md");

  const fetchGroupSettlement = async () => {
    setLoading(true);
    const groupIdJson = { id: params.groupId };
    try {
      const group_settle = await getGroupSettleService(
        groupIdJson,
        setAlert,
        setAlertMessage
      );
      const data = group_settle?.data?.data || [];
      setGroupSettlement(data);
      setNoSettle(data.length === 0 || data.every((settle) => settle[2] <= 0));
      setRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error("GroupSettlements - Fetch error:", error);
      setGroupSettlement([]);
      setNoSettle(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroupSettlement();
  }, []);

  const handleSettlementComplete = () => {
    fetchGroupSettlement(); // Re-fetch data after settlement
  };

  console.log("GroupSettlements - Rendering groupSettlement:", groupSettlement);

  return (
    <>
      {loading ? (
        <Loading />
      ) : (
        <Box sx={{ pb: 3 }}>
          <AlertBanner
            showAlert={alert}
            alertMessage={alertMessage}
            severity="error"
          />
          <Grid container spacing={2}>
            {groupSettlement.map(
              (mySettle, index) =>
                mySettle[2] > 0 && (
                  <Grid item xs={12} md={6} key={index}>
                    <SettlementCard
                      mySettle={mySettle}
                      currencyType={currencyType}
                      onSettlementComplete={handleSettlementComplete}
                    />
                  </Grid>
                )
            )}
          </Grid>

          {noSettle ? (
            <Grid
              container
              direction="column"
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                textAlign: "center",
                minHeight: "200px",
              }}
            >
              <Iconify
                icon="icon-park-twotone:doc-success"
                sx={{
                  color: (theme) => theme.palette["success"].dark,
                  fontSize: 100,
                }}
              />
              <Typography fontSize={18} textAlign={"center"} my={1}>
                No Settlement required!
              </Typography>
            </Grid>
          ) : (
            <UserBalanceChart key={refreshKey} /> // Use refreshKey to force re-render
          )}
        </Box>
      )}
    </>
  );
};
