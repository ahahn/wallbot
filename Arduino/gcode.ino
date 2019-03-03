
void step(int motor, int steps) {
  #ifdef DEBUG
  if (debug >= 5) {
    Serial.print("stepping motor ");
    Serial.print(motor);
    Serial.print(" ");
    Serial.print(steps);
    Serial.print(" steps");
    Serial.println();
  }
  #endif
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
void goOriginRight() {
  if (stepsRight != 0) {
    #ifdef DEBUG
    if (debug > 0) {
      Serial.print("Right motor stepping ");
      Serial.print((stepsRight < 0)? "FORWARD " : "BACKWARD ");
      Serial.print(abs(stepsRight));
      Serial.println(" steps");
    }
    #endif
    step(MOTOR_RIGHT, stepsRight * -1);
    stepsRight = 0;
  }
}
void goOriginLeft() {
  if (stepsLeft != 0) {
    #ifdef DEBUG
    if (debug > 0) {
      Serial.print("Left motor stepping ");
      Serial.print((stepsLeft < 0)? "FORWARD " : "BACKWARD ");
      Serial.print(abs(stepsLeft));
      Serial.println(" steps");
    }
    #endif
    step(MOTOR_LEFT, stepsLeft * -1);
    stepsLeft = 0;
  }
}
void goOrigin() {
  // lengthen before shortening
  if (stepsLeft > stepsRight) {
    goOriginRight();
    goOriginLeft();
  } else {
    goOriginLeft();
    goOriginRight();
  }
  curX = canvasWidth / 2;
  curY = canvasHeight / 2;
}
long getRightLength(int x, int y) {
  long rxdist = min(canvasWidth,canvasWidth - x);
  long ydist = max(0,min(y,canvasHeight));
  #ifdef DEBUG
  if (debug >= 3) {
    Serial.print("rxdist ");
    Serial.println(rxdist);
    Serial.print("ydist ");
    Serial.println(ydist);
  }
  #endif
  long rs = rxdist *rxdist;
  long ys = ydist*ydist;
  #ifdef DEBUG
  if (debug >= 3) {
    Serial.print("right squared ");
    Serial.println(rs);
    Serial.print("y squared ");
    Serial.println(ys);
  }
  #endif
  long rtot = rs + ys;
  double rl = sqrt(rtot);
  #ifdef DEBUG
  if (debug >= 3) {
    Serial.print("rl is ");
    Serial.println(rl);
  }
  #endif
  return (long(sqrt(rs+ys)));
}
long getLeftLength(int x, int y) {
  long lxdist = max(0,x);
  long ydist = max(0,min(y,canvasHeight));
  #ifdef DEBUG
  if (debug >= 3) {
    Serial.print("lxdist ");
    Serial.println(lxdist);
    Serial.print("ydist ");
    Serial.println(ydist);
  }
  #endif
  long ls = lxdist * lxdist;
  long ys = ydist*ydist;
  #ifdef DEBUG
  if (debug >= 3) {
    Serial.print("left squared ");
    Serial.println(ls);
    Serial.print("y squared ");
    Serial.println(ys);
  }
  #endif
  double ll = sqrt(ls+ys);
  #ifdef DEBUG
  if (debug >= 3) {
    Serial.print("ll is ");
    Serial.println(ll);
  }
  #endif
  return(long(sqrt(ls+ys)));
}
void go(int x, int y) {
  go(x, y, 0);
}
void go(int x, int y, int byArcs) {
  #ifdef DEBUG
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
  #endif
  long rightLen = getRightLength(curX + x, curY + y);
  long leftLen = getLeftLength(curX + x, curY + y);
  long curRightLen = getRightLength(curX, curY);
  long curLeftLen = getLeftLength(curX, curY);
  #ifdef DEBUG
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
  #endif
  // go there!
  int dr = (rightLen - curRightLen) * 2;
  int dl = (leftLen - curLeftLen) * 2;
  #ifdef DEBUG
  if (debug >= 1) {
    Serial.print("dr " );
    Serial.println(dr);
    Serial.print("dl " );
    Serial.println(dl);
  }
  #endif
  if (byArcs != 0) {
    step(MOTOR_RIGHT, dr);
    step(MOTOR_LEFT, dl);
  } else {
    int numSteps = max(abs(dr),abs(dl));
    #ifdef DEBUG
    if (debug >= 1) {
      Serial.print("steps is ");
      Serial.println(numSteps);
    }
    #endif
    int rSteps = 0;
    int lSteps = 0;
    double rsUnit = double(dr)/numSteps;
    double lsUnit = double(dl)/numSteps;
    #ifdef DEBUG
    if (debug >= 1) {
      Serial.print("rsUnit ");
      Serial.print(rsUnit);
      Serial.print(" lsUnit ");
      Serial.println(lsUnit);
    }
    #endif
    for (int i = 0; i < numSteps;i++) {
      int thisRS = rsUnit * (i + 1);
      int thisLS = lsUnit * (i + 1);
      if (thisRS != rSteps) {
        #ifdef DEBUG
        if (debug >= 3) {
          Serial.print("thisRS is ");
          Serial.print(thisRS);
          Serial.print(" rSteps ");
          Serial.print(rSteps);
          Serial.print(" moving ");
          Serial.println(thisRS - rSteps);
        }
        #endif
        step(MOTOR_RIGHT,thisRS - rSteps);
        rSteps = thisRS;
      }
      if (thisLS != lSteps) {
            #ifdef DEBUG
        if (debug >= 3) {
          Serial.print("thisLS is ");
          Serial.print(thisLS);
          Serial.print(" lSteps ");
          Serial.print(lSteps);
          Serial.print(" moving ");
          Serial.println(thisLS - lSteps);
        }
        #endif
        step(MOTOR_LEFT,thisLS - lSteps);
        lSteps = thisLS;
      }
    }
    if (rSteps != dr) {
          #ifdef DEBUG
      if (debug >= 1) {
        Serial.print("finishing right with ");
        Serial.print(dr - rSteps);
        Serial.println(" steps");
      }
      #endif
      step(MOTOR_RIGHT,dr - rSteps);
    }
    if (lSteps != dl) {
                #ifdef DEBUG
      if (debug >= 1) {
        Serial.print("finishing left with ");
        Serial.print(dl - lSteps);
        Serial.println(" steps");
      }
      #endif
      step(MOTOR_LEFT,dl - lSteps);
    }
  }

  curX = curX + x;
  curY = curY + y;
}
void penUp() {
  while (servoAngle < SERVOUP) {
    servoAngle = servoAngle + 5;
    servo1.write(servoAngle);
    delay(20);
  }
}
void penDown() {
  delay(60);
  while (servoAngle > SERVODOWN) {
    servoAngle = servoAngle - 5;
    servo1.write(servoAngle);
    delay(15);
  }
}
