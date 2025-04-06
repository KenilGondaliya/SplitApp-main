import {
  DesktopDatePicker,
  LoadingButton,
  LocalizationProvider,
  MobileDatePicker,
} from "@mui/lab";
import {
  Button,
  Grid,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import useResponsive from "../../../theme/hooks/useResponsive";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import * as Yup from "yup";
import { Form, FormikProvider, useFormik } from "formik";
import { currencyFind } from "../../../utils/helper";
import Loading from "../../loading";
import { useState } from "react";
import { useParams } from "react-router-dom";
import AlertBanner from "../../AlertBanner";
import Iconify from "../../Iconify";
import {
  createPaymentOrderService,
  verifyPaymentService,
} from "../../../services/expenseServices.js";

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

const BalanceSettlement = ({
  currencyType,
  settleTo,
  settleFrom,
  amount,
  handleClose,
  setReload,
}) => {
  const mdUp = useResponsive("up", "md");
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState();
  const [settleSuccess, setSettleSuccess] = useState(false);
  const params = useParams();

  console.log("BalanceSettlement - Props:", {
    currencyType,
    settleTo,
    settleFrom,
    amount,
  });

  const settlementSchema = Yup.object().shape({
    settleTo: Yup.string().required("Settle to is required"),
    settleFrom: Yup.string().required("Settle from is required"),
    settleAmount: Yup.number()
      .required("Amount is required")
      .min(0, "Min is 0")
      .max(amount, "Max is " + amount),
  });

  const formik = useFormik({
    initialValues: {
      settleTo: settleTo || "",
      settleFrom: settleFrom || "",
      settleAmount: amount || 0,
      settleDate: Date(),
      groupId: params.groupId || "",
    },
    validationSchema: settlementSchema,
    onSubmit: async (values) => {
      setLoading(true);
      try {
        const scriptLoaded = await loadRazorpayScript();
        if (!scriptLoaded) {
          throw new Error("Failed to load payment gateway");
        }

        const profileData = JSON.parse(localStorage.getItem("profile") || "{}");
        const token = profileData?.accessToken;
        if (!token) {
          throw new Error("No access token found. Please log in again.");
        }

        const orderResponse = await createPaymentOrderService(
          {
            amount: values.settleAmount,
            currency: currencyType,
            settleTo: values.settleTo,
            settleFrom: values.settleFrom,
            groupId: values.groupId,
          },
          setAlert,
          setAlertMessage
        );

        if (!orderResponse || orderResponse.data.status !== "Success") {
          throw new Error(
            orderResponse?.data?.message || "Failed to create payment order"
          );
        }

        const orderData = orderResponse.data;

        const options = {
          key: orderData.key_id, 
          amount: orderData.amount,
          currency: orderData.currency,
          name: "Expense Settlement",
          description: `Payment from ${settleFrom} to ${settleTo}`,
          order_id: orderData.order_id,
          handler: async (response) => {
            const verifyResponse = await verifyPaymentService(
              {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                settleTo: values.settleTo,
                settleFrom: values.settleFrom,
                amount: values.settleAmount,
                settlementId: orderData.settlementId,
              },
              setAlert,
              setAlertMessage
            );

            if (verifyResponse?.data.status === "Success") {
              setSettleSuccess(true);
              setReload(true);
              setTimeout(() => {
                handleClose();
              }, 1500);
            } else {
              throw new Error(
                verifyResponse?.data?.message || "Payment verification failed"
              );
            }
          },
          prefill: { email: settleFrom },
          theme: { color: "#F37254" },
        };

        const paymentObject = new window.Razorpay(options);
        paymentObject.open();
      } catch (error) {
        setAlert(true);
        setAlertMessage(error.message || "Payment processing failed");
      } finally {
        setLoading(false);
      }
    },
  });
  const { errors, touched, handleSubmit, getFieldProps } = formik;

  return (
    <>
      {loading ? (
        <Loading />
      ) : (
        <>
          {settleSuccess ? (
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
                icon="icon-park-twotone:success"
                sx={{
                  color: (theme) => theme.palette["success"].dark,
                  fontSize: 100,
                }}
              />
              <Typography variant="h4" textAlign={"center"} mt={2}>
                Settlement Successful!
              </Typography>
            </Grid>
          ) : (
            <>
              <Typography
                id="modal-modal-title"
                variant="h6"
                component="h2"
                mb={4}
              >
                Settle Balance
              </Typography>
              <AlertBanner
                showAlert={alert}
                alertMessage={alertMessage}
                severity="error"
              />
              <FormikProvider value={formik}>
                <Form autoComplete="off" noValidate onSubmit={handleSubmit}>
                  <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth
                        name="settleTo"
                        id="outlined-basic"
                        type="text"
                        label="Settlement to"
                        variant="outlined"
                        disabled
                        {...getFieldProps("settleTo")}
                        error={Boolean(touched.settleTo && errors.settleTo)}
                        helperText={touched.settleTo && errors.settleTo}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth
                        name="settleFrom"
                        id="outlined-basic"
                        type="text"
                        label="Settlement from"
                        variant="outlined"
                        disabled
                        {...getFieldProps("settleFrom")}
                        error={Boolean(touched.settleFrom && errors.settleFrom)}
                        helperText={touched.settleFrom && errors.settleFrom}
                      />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <LocalizationProvider dateAdapter={AdapterDateFns}>
                        {mdUp ? (
                          <DesktopDatePicker
                            name="settleDate"
                            label="Settlement Date"
                            inputFormat="dd/MM/yyyy"
                            renderInput={(params) => (
                              <TextField {...params} sx={{ width: "100%" }} />
                            )}
                            value={formik.values.settleDate}
                            onChange={(value) => {
                              formik.setFieldValue(
                                "settleDate",
                                Date.parse(value)
                              );
                            }}
                          />
                        ) : (
                          <MobileDatePicker
                            name="settleDate"
                            label="Settlement Date"
                            inputFormat="dd/MM/yyyy"
                            renderInput={(params) => (
                              <TextField {...params} sx={{ width: "100%" }} />
                            )}
                            value={formik.values.settleDate}
                            onChange={(value) => {
                              formik.setFieldValue(
                                "settleDate",
                                Date.parse(value)
                              );
                            }}
                          />
                        )}
                      </LocalizationProvider>
                    </Grid>
                    <Grid item xs={12} md={8}>
                      <TextField
                        fullWidth
                        name="settleAmount"
                        id="outlined-basic"
                        type="number"
                        label="Settlement Amount"
                        variant="outlined"
                        min={5}
                        {...getFieldProps("settleAmount")}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              {currencyFind(currencyType)}
                            </InputAdornment>
                          ),
                        }}
                        error={Boolean(
                          touched.settleAmount && errors.settleAmount
                        )}
                        helperText={touched.settleAmount && errors.settleAmount}
                      />
                    </Grid>
                    {mdUp && <Grid item xs={0} md={6} />}
                    <Grid item xs={6} md={3}>
                      <Button
                        fullWidth
                        size="large"
                        variant="outlined"
                        onClick={handleClose}
                      >
                        Cancel
                      </Button>
                    </Grid>
                    <Grid item xs={6} md={3}>
                      <LoadingButton
                        fullWidth
                        size="large"
                        type="submit"
                        variant="contained"
                      >
                        Settle
                      </LoadingButton>
                    </Grid>
                  </Grid>
                </Form>
              </FormikProvider>
            </>
          )}
        </>
      )}
    </>
  );
};

export default BalanceSettlement;