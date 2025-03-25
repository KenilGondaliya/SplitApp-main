import { Avatar, Button, Grid, Modal, Stack, Typography } from "@mui/material";
import { Box } from "@mui/system";
import useResponsive from "../../../theme/hooks/useResponsive";
import { convertToCurrency, currencyFind } from "../../../utils/helper";
import BalanceSettlement from "./balanceSettlement";
import React, { useState, useEffect } from "react";
import configData from "../../../config.json";
import gravatarUrl from "gravatar-url";

const style = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  bgcolor: "background.paper",
  boxShadow: 2,
  p: 4,
  borderRadius: 1,
};

const SettlementCard = ({ mySettle, currencyType, onSettlementComplete }) => {
  const xsUp = useResponsive("up", "sm");
  const [reload, setReload] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    console.log('SettlementCard - mySettle:', mySettle); // Debug prop on every render
    if (reload && onSettlementComplete) {
      console.log('SettlementCard - Reload triggered, calling onSettlementComplete');
      onSettlementComplete(); // Notify parent to refresh
    }
  }, [reload, onSettlementComplete]);

  const handleOpen = () => setOpen(true);
  const handleClose = () => {
    console.log('SettlementCard - Closing modal, reload:', reload);
    setOpen(false);
    setReload(false); // Reset reload state
  };

  if (!mySettle || !Array.isArray(mySettle) || mySettle.length < 3) {
    console.warn('SettlementCard - Invalid mySettle:', mySettle);
    return <Typography>Invalid settlement data</Typography>;
  }

  const [settleFrom, settleTo, amount] = mySettle;

  console.log('SettlementCard - Destructured:', { settleFrom, settleTo, amount }); // Debug values

  return (
    <Stack
      direction="row"
      spacing={1}
      justifyContent="space-evenly"
      alignItems="center"
      sx={{
        bgcolor: (theme) => theme.palette["warning"].lighter,
        p: 3,
        borderRadius: 2,
        boxShadow: 4,
      }}
    >
      <Avatar
        src={gravatarUrl(settleFrom, {
          size: 200,
          default: configData.USER_DEFAULT_LOGO_URL,
        })}
        alt="photoURL"
        sx={{ width: 56, height: 56 }}
      />
      <Stack spacing={0}>
        <Typography
          variant="body"
          noWrap
          sx={{ fontWeight: 600, ...(!xsUp && { fontSize: 12 }) }}
        >
          {settleFrom.split("@")[0]}
        </Typography>
        <Typography
          variant="body"
          noWrap
          sx={{ ...(!xsUp && { fontSize: 12 }) }}
        >
          to{" "}
          <Typography variant="subtitle" sx={{ fontWeight: 600 }}>
            {settleTo.split("@")[0]}
          </Typography>
        </Typography>
        {!xsUp && (
          <>
            <Typography
              variant="body2"
              sx={{
                fontSize: 10,
                mt: "3px",
                color: (theme) => theme.palette["error"].dark,
              }}
            >
              Settlement Amount
            </Typography>
            <Typography
              variant="body2"
              noWrap
              sx={{
                fontWeight: 900,
                color: (theme) => theme.palette["error"].dark,
              }}
            >
              {currencyFind(currencyType)} {convertToCurrency(amount)}
            </Typography>
          </>
        )}
      </Stack>
      {xsUp && (
        <Stack spacing={0} alignItems="center">
          <Typography
            variant="body2"
            sx={{ fontSize: 10, color: (theme) => theme.palette["error"].dark }}
          >
            Settlement Amount
          </Typography>
          <Typography
            variant="body2"
            noWrap
            sx={{
              fontWeight: 900,
              color: (theme) => theme.palette["error"].dark,
            }}
          >
            {currencyFind(currencyType)} {convertToCurrency(amount)}
          </Typography>
        </Stack>
      )}
      <Button onClick={handleOpen}>Settle</Button>
      <Modal open={open} onClose={handleClose}>
        <Box sx={style} width={xsUp ? "50%" : "90%"}>
          <BalanceSettlement
            currencyType={currencyType}
            settleTo={settleTo}
            settleFrom={settleFrom}
            amount={amount}
            handleClose={handleClose}
            setReload={setReload}
          />
        </Box>
      </Modal>
    </Stack>
  );
};

export default SettlementCard;