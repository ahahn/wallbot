
void step(int motor, int steps) {
  if (debug >= 5) {
    Serial.print("stepping motor ");
    Serial.print(motor);
    Serial.print(" ");
    Serial.print(steps);
    Serial.print(" steps");
    Serial.println();
  }
  if (motor == MOTOR_RIGHT) {
    stepsRight += steps;
//    if (abs(steps) > 30) {
//      myMotor1->step(5, (steps < 0) ? MOTOR_RIGHT_BACKWARD : MOTOR_RIGHT_FORWARD, STEPPERCOIL);
//      myMotor1->setSpeed(3);
//      myMotor1->step(5, (steps < 0) ? MOTOR_RIGHT_BACKWARD : MOTOR_RIGHT_FORWARD, STEPPERCOIL);
//      myMotor1->setSpeed(4);
//      myMotor1->step(abs(steps)-20, (steps < 0) ? MOTOR_RIGHT_BACKWARD : MOTOR_RIGHT_FORWARD, STEPPERCOIL);
//      myMotor1->setSpeed(3);
//      myMotor1->step(5, (steps < 0) ? MOTOR_RIGHT_BACKWARD : MOTOR_RIGHT_FORWARD, STEPPERCOIL);
//      myMotor1->setSpeed(2);
//      myMotor1->step(5, (steps < 0) ? MOTOR_RIGHT_BACKWARD : MOTOR_RIGHT_FORWARD, STEPPERCOIL);
//    } else {
      myMotor1->step(abs(steps), (steps < 0) ? MOTOR_RIGHT_BACKWARD : MOTOR_RIGHT_FORWARD, STEPPERCOIL);
//    }
  } else {
    stepsLeft += steps;
    myMotor2->step(abs(steps), (steps < 0) ? MOTOR_LEFT_BACKWARD : MOTOR_LEFT_FORWARD, STEPPERCOIL);
  }
}
void goOrigin() {
  if (stepsRight != 0) {
    if (debug > 0) {
      Serial.print("Right motor stepping ");
      Serial.print((stepsRight < 0)? "FORWARD " : "BACKWARD ");
      Serial.print(abs(stepsRight));
      Serial.println(" steps");
    }
    step(MOTOR_RIGHT, stepsRight * -1);
    stepsRight = 0;
  }
  if (stepsLeft != 0) {
    if (debug > 0) {
      Serial.print("Left motor stepping ");
      Serial.print((stepsLeft < 0)? "FORWARD " : "BACKWARD ");
      Serial.print(abs(stepsLeft));
      Serial.println(" steps");
    }
    step(MOTOR_LEFT, stepsLeft * -1);
    stepsLeft = 0;
    curX = canvasWidth / 2;
    curY = canvasHeight / 2;
  }
}
long getRightLength(int x, int y) {
  long rxdist = min(canvasWidth,canvasWidth - x);
  long ydist = max(0,min(y,canvasHeight));
  if (debug >= 3) {
    Serial.print("rxdist ");
    Serial.println(rxdist);
    Serial.print("ydist ");
    Serial.println(ydist);
  }
  long rs = rxdist *rxdist;
  long ys = ydist*ydist;
  if (debug >= 3) {
    Serial.print("right squared ");
    Serial.println(rs);
    Serial.print("y squared ");
    Serial.println(ys);
  }
  long rtot = rs + ys;
  double rl = sqrt(rtot);
  if (debug >= 3) {
    Serial.print("rl is ");
    Serial.println(rl);
  }
  return (long(sqrt(rs+ys)));
}
long getLeftLength(int x, int y) {
  long lxdist = max(0,x);
  long ydist = max(0,min(y,canvasHeight));
  if (debug >= 3) {
    Serial.print("lxdist ");
    Serial.println(lxdist);
    Serial.print("ydist ");
    Serial.println(ydist);
  }
  long ls = lxdist * lxdist;
  long ys = ydist*ydist;
  if (debug >= 3) {
    Serial.print("left squared ");
    Serial.println(ls);
    Serial.print("y squared ");
    Serial.println(ys);
  }
  double ll = sqrt(ls+ys);
  if (debug >= 3) {
    Serial.print("ll is ");
    Serial.println(ll);
  }
  return(long(sqrt(ls+ys)));
}
void go(int x, int y) {
  go(x, y, 0);
}
void go(int x, int y, int byArcs) {
  if (debug >= 1) {
    Serial.print("go distance ");
    Serial.print(x);
    Serial.print(" ");
    Serial.print(y);
    Serial.println();
    Serial.print("to position ");
    Serial.print(curX + x);
    Serial.print(" ");
    Serial.print(curY + y);
    Serial.println();
  }
  long rightLen = getRightLength(curX + x, curY + y);
  long leftLen = getLeftLength(curX + x, curY + y);
  long curRightLen = getRightLength(curX, curY);
  long curLeftLen = getLeftLength(curX, curY);
  if (debug >= 1) {
    Serial.print("current right len ");
    Serial.println(curRightLen);
    Serial.print("current left len ");
    Serial.println(curLeftLen);
    Serial.print("target right len ");
    Serial.println(rightLen);
    Serial.print("target left len ");
    Serial.println(leftLen);
  }
  // go there!
  int dr = (rightLen - curRightLen) * 2;
  int dl = (leftLen - curLeftLen) * 2;
  if (debug >= 1) {
    Serial.print("dr " );
    Serial.println(dr);
    Serial.print("dl " );
    Serial.println(dl);
  }
  if (byArcs != 0) {
    step(MOTOR_RIGHT, dr);
    step(MOTOR_LEFT, dl);
  } else {
    int numSteps = max(abs(dr),abs(dl));
    if (debug >= 1) {
      Serial.print("steps is ");
      Serial.println(numSteps);
    }
    int rSteps = 0;
    int lSteps = 0;
    double rsUnit = double(dr)/numSteps;
    double lsUnit = double(dl)/numSteps;
    if (debug >= 1) {
      Serial.print("rsUnit ");
      Serial.print(rsUnit);
      Serial.print(" lsUnit ");
      Serial.println(lsUnit);
    }
    for (int i = 0; i < numSteps;i++) {
      int thisRS = rsUnit * (i + 1);
      int thisLS = lsUnit * (i + 1);
      if (thisRS != rSteps) {
        if (debug >= 3) {
          Serial.print("thisRS is ");
          Serial.print(thisRS);
          Serial.print(" rSteps ");
          Serial.print(rSteps);
          Serial.print(" moving ");
          Serial.println(thisRS - rSteps);
        }
        step(MOTOR_RIGHT,thisRS - rSteps);
        rSteps = thisRS;
      }
      if (thisLS != lSteps) {
        if (debug >= 3) {
          Serial.print("thisLS is ");
          Serial.print(thisLS);
          Serial.print(" lSteps ");
          Serial.print(lSteps);
          Serial.print(" moving ");
          Serial.println(thisLS - lSteps);
        }
        step(MOTOR_LEFT,thisLS - lSteps);
        lSteps = thisLS;
      }
    }
    if (rSteps != dr) {
      if (debug >= 1) {
        Serial.print("finishing right with ");
        Serial.print(dr - rSteps);
        Serial.println(" steps");
      }
      step(MOTOR_RIGHT,dr - rSteps);
    }
    if (lSteps != dl) {
      if (debug >= 1) {
        Serial.print("finishing left with ");
        Serial.print(dl - lSteps);
        Serial.println(" steps");
      }
      step(MOTOR_LEFT,dl - lSteps);
    }
  }

  curX = curX + x;
  curY = curY + y;
}
void penUp() {
  int targetAngle = servoAngle + 60;
  while (servoAngle < targetAngle) {
    servoAngle = servoAngle + 5;
    servo1.write(servoAngle);
    delay(20);
  }
}
void penDown() {
  delay(60);
  int targetAngle = servoAngle - 60;
  while (servoAngle > targetAngle) {
    servoAngle = servoAngle - 5;
    servo1.write(servoAngle);
    delay(15);
  }
}
